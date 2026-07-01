package com.xrproofing.crm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.net.wifi.WifiManager
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class CallService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var pollFuture: ScheduledFuture<*>? = null
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private var lastSeenEventId: String? = null
    private var isRinging = false
    private var ringtone: Ringtone? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    companion object {
        const val CHANNEL_ID = "xrp_call_service"
        const val RING_CHANNEL_ID = "xrp_incoming_call"
        const val NOTIFICATION_ID = 1001
        const val RING_NOTIFICATION_ID = 1002
        const val SUPABASE_URL = "https://lcchocuoeettbryfwlwq.supabase.co"
        const val SUPABASE_ANON_KEY = "sb_publishable_W8F6R4IraBZIt79dC5y3qg_BqypPa9C"

        fun start(context: Context) {
            try {
                val intent = Intent(context, CallService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                android.util.Log.e("CallService", "Failed to start service: ${e.message}")
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, CallService::class.java))
            } catch (e: Exception) {
                android.util.Log.e("CallService", "Failed to stop service: ${e.message}")
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        try {
            createNotificationChannels()
        } catch (e: Exception) {
            android.util.Log.e("CallService", "onCreate error: ${e.message}")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val notification = buildNotification()
            startForeground(NOTIFICATION_ID, notification)

            // Keep CPU awake
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "XRPRoofing::CallServiceLock"
            ).apply { acquire() }

            // Keep WiFi alive
            try {
                val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                @Suppress("DEPRECATION")
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "XRPRoofing::WifiLock").apply { acquire() }
            } catch (e: Exception) {
                android.util.Log.w("CallService", "WiFi lock failed: ${e.message}")
            }

            // Start polling for incoming calls
            startPolling()
        } catch (e: Exception) {
            android.util.Log.e("CallService", "startForeground failed: ${e.message}")
            stopSelf()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        try {
            stopPolling()
            stopRinging()
            wifiLock?.let { if (it.isHeld) it.release() }
            wifiLock = null
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = null
        } catch (e: Exception) {
            android.util.Log.e("CallService", "onDestroy error: ${e.message}")
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startPolling() {
        pollFuture?.cancel(false)
        pollFuture = executor.scheduleAtFixedRate({
            try {
                checkForIncomingCalls()
            } catch (e: Exception) {
                android.util.Log.e("CallService", "Poll error: ${e.message}")
            }
        }, 0, 3, TimeUnit.SECONDS)
    }

    private fun stopPolling() {
        pollFuture?.cancel(false)
        pollFuture = null
    }

    private fun checkForIncomingCalls() {
        val prefs = getSharedPreferences("xrp_prefs", Context.MODE_PRIVATE)
        val accessToken = prefs.getString("access_token", null) ?: return

        // Query for ringing events in the last 30 seconds
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val thirtySecondsAgo = sdf.format(Date(System.currentTimeMillis() - 30000))

        val urlStr = "$SUPABASE_URL/rest/v1/conversation_events" +
            "?select=id,status,type,created_at" +
            "&status=eq.ringing" +
            "&created_at=gte.$thirtySecondsAgo" +
            "&order=created_at.desc" +
            "&limit=1"

        val url = URL(urlStr)
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "GET"
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
            conn.setRequestProperty("Authorization", "Bearer $accessToken")
            conn.setRequestProperty("Accept", "application/json")
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            val responseCode = conn.responseCode
            if (responseCode == 200) {
                val body = conn.inputStream.bufferedReader().readText()
                val events = JSONArray(body)

                if (events.length() > 0) {
                    val event = events.getJSONObject(0)
                    val eventId = event.getString("id")

                    if (eventId != lastSeenEventId) {
                        lastSeenEventId = eventId
                        if (!isRinging) {
                            triggerIncomingCall()
                        }
                    }
                } else {
                    // No ringing events — stop ringing if active
                    if (isRinging) {
                        mainHandler.post { stopRinging() }
                    }
                }
            } else if (responseCode == 401) {
                android.util.Log.w("CallService", "Token expired, waiting for refresh")
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun triggerIncomingCall() {
        isRinging = true
        mainHandler.post {
            try {
                // Vibrate
                vibrate()

                // Play ringtone
                try {
                    val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                    ringtone = RingtoneManager.getRingtone(applicationContext, ringtoneUri)
                    ringtone?.let {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            it.isLooping = true
                        }
                        it.play()
                    }
                } catch (e: Exception) {
                    android.util.Log.w("CallService", "Ringtone failed: ${e.message}")
                }

                // Show high-priority notification
                showIncomingCallNotification()

                // Wake up the screen
                wakeScreen()

                // Auto-stop ringing after 30 seconds
                mainHandler.postDelayed({ stopRinging() }, 30000)
            } catch (e: Exception) {
                android.util.Log.e("CallService", "triggerIncomingCall error: ${e.message}")
            }
        }
    }

    private fun vibrate() {
        try {
            val pattern = longArrayOf(0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                val vibrator = vm.defaultVibrator
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(pattern, 0)
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("CallService", "Vibrate failed: ${e.message}")
        }
    }

    private fun stopRinging() {
        isRinging = false
        try {
            // Stop vibration
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.cancel()
            } else {
                @Suppress("DEPRECATION")
                (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel()
            }
        } catch (e: Exception) {}
        try {
            ringtone?.stop()
            ringtone = null
        } catch (e: Exception) {}
        try {
            val nm = getSystemService(NotificationManager::class.java)
            nm.cancel(RING_NOTIFICATION_ID)
        } catch (e: Exception) {}
    }

    private fun wakeScreen() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val screenLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                "XRPRoofing::ScreenWake"
            )
            screenLock.acquire(10000) // 10 seconds
        } catch (e: Exception) {
            android.util.Log.w("CallService", "Wake screen failed: ${e.message}")
        }
    }

    private fun showIncomingCallNotification() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this, 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, RING_CHANNEL_ID)
                .setContentTitle("Incoming Call")
                .setContentText("XRP Roofing — Tap to answer")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(pendingIntent, true)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build()

            val nm = getSystemService(NotificationManager::class.java)
            nm.notify(RING_NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            android.util.Log.e("CallService", "Notification failed: ${e.message}")
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)

            // Low-priority channel for persistent "ready" notification
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Call Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps XRP Roofing ready to receive calls"
                setShowBadge(false)
            }
            nm.createNotificationChannel(serviceChannel)

            // High-priority channel for incoming call alerts
            val ringChannel = NotificationChannel(
                RING_CHANNEL_ID,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for incoming calls"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 500, 1000)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            }
            nm.createNotificationChannel(ringChannel)
        }
    }

    private fun buildNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("XRP Roofing")
            .setContentText("Ready for incoming calls")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}

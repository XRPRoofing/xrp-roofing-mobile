package com.xrproofing.crm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
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
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class CallService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastSeenEventId: String? = null
    private var isRinging = false
    private var ringtone: Ringtone? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pollThread: Thread? = null
    @Volatile private var running = false
    private var pollCount = 0

    companion object {
        const val CHANNEL_ID = "xrp_call_service"
        const val RING_CHANNEL_ID = "xrp_incoming_call"
        const val NOTIFICATION_ID = 1001
        const val RING_NOTIFICATION_ID = 1002
        const val SUPABASE_URL = "https://lcchocuoeettbryfwlwq.supabase.co"
        const val SUPABASE_ANON_KEY = "sb_publishable_W8F6R4IraBZIt79dC5y3qg_BqypPa9C"
        const val TAG = "XRPCallService"

        fun start(context: Context) {
            try {
                val intent = Intent(context, CallService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Failed to start: ${e.message}")
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, CallService::class.java))
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Failed to stop: ${e.message}")
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        try {
            createNotificationChannels()
        } catch (e: Throwable) {
            android.util.Log.e(TAG, "onCreate: ${e.message}")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            startForeground(NOTIFICATION_ID, buildServiceNotification("Starting..."))
            android.util.Log.i(TAG, "Service started, acquiring wake lock")

            // Keep CPU awake
            try {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "XRPRoofing::CallServiceLock"
                ).apply { acquire() }
            } catch (e: Throwable) {
                android.util.Log.e(TAG, "Wake lock failed: ${e.message}")
            }

            // Start polling
            startPolling()
        } catch (e: Throwable) {
            android.util.Log.e(TAG, "startForeground failed: ${e.message}")
            stopSelf()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        try { pollThread?.interrupt() } catch (_: Throwable) {}
        try { stopRinging() } catch (_: Throwable) {}
        try {
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = null
        } catch (_: Throwable) {}
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startPolling() {
        running = true
        pollThread = Thread {
            android.util.Log.i(TAG, "Poll thread started")
            while (running) {
                try {
                    checkForIncomingCalls()
                    pollCount++
                    if (pollCount % 10 == 0) {
                        mainHandler.post { updateServiceNotification("Monitoring... (${pollCount} checks)") }
                    }
                } catch (e: Throwable) {
                    android.util.Log.e(TAG, "Poll error: ${e.message}")
                }
                try { Thread.sleep(3000) } catch (_: InterruptedException) { break }
            }
            android.util.Log.i(TAG, "Poll thread stopped")
        }.apply {
            isDaemon = true
            name = "XRP-CallPoll"
            start()
        }
    }

    private fun checkForIncomingCalls() {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val thirtySecondsAgo = sdf.format(Date(System.currentTimeMillis() - 30000))

        val urlStr = "$SUPABASE_URL/rest/v1/conversation_events" +
            "?select=id,status,created_at" +
            "&status=eq.ringing" +
            "&created_at=gte.$thirtySecondsAgo" +
            "&order=created_at.desc" +
            "&limit=1"

        val conn = URL(urlStr).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "GET"
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
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
                        android.util.Log.i(TAG, "New ringing event: $eventId")
                        lastSeenEventId = eventId
                        if (!isRinging) {
                            mainHandler.post { triggerIncomingCall() }
                        }
                    }
                } else {
                    if (isRinging) {
                        mainHandler.post { stopRinging() }
                    }
                }
            } else {
                android.util.Log.w(TAG, "API response: $responseCode")
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun triggerIncomingCall() {
        android.util.Log.i(TAG, "=== INCOMING CALL DETECTED ===")
        isRinging = true

        try { vibrate() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Vibrate failed: ${e.message}")
        }

        try { playRingtone() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Ringtone failed: ${e.message}")
        }

        try { showIncomingCallNotification() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Notification failed: ${e.message}")
        }

        try { wakeScreen() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Wake screen failed: ${e.message}")
        }

        // Auto-stop after 30 seconds
        mainHandler.postDelayed({ stopRinging() }, 30000)
    }

    private fun vibrate() {
        val pattern = longArrayOf(0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
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
    }

    private fun playRingtone() {
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ringtone = RingtoneManager.getRingtone(applicationContext, uri)?.apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                isLooping = true
            }
            play()
        }
    }

    private fun stopRinging() {
        isRinging = false
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator.cancel()
            } else {
                @Suppress("DEPRECATION")
                (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel()
            }
        } catch (_: Throwable) {}
        try { ringtone?.stop(); ringtone = null } catch (_: Throwable) {}
        try { (getSystemService(NotificationManager::class.java)).cancel(RING_NOTIFICATION_ID) } catch (_: Throwable) {}
    }

    private fun wakeScreen() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        val wl = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "XRPRoofing::ScreenWake"
        )
        wl.acquire(10_000)
    }

    private fun showIncomingCallNotification() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(this, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(this, RING_CHANNEL_ID)
            .setContentTitle("Incoming Call")
            .setContentText("XRP Roofing — Tap to answer")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pi, true)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        (getSystemService(NotificationManager::class.java)).notify(RING_NOTIFICATION_ID, notification)
    }

    private fun updateServiceNotification(text: String) {
        try {
            val nm = getSystemService(NotificationManager::class.java)
            nm.notify(NOTIFICATION_ID, buildServiceNotification(text))
        } catch (_: Throwable) {}
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)

            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_ID, "Call Service", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps XRP Roofing ready to receive calls"
                setShowBadge(false)
            })

            nm.createNotificationChannel(NotificationChannel(
                RING_CHANNEL_ID, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for incoming calls"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 500, 1000)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            })
        }
    }

    private fun buildServiceNotification(text: String): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pi = PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("XRP Roofing")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setOngoing(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}

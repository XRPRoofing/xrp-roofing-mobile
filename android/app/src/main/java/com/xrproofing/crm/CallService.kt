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
import android.media.MediaPlayer
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
    private var mediaPlayer: MediaPlayer? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pollThread: Thread? = null
    @Volatile private var running = false
    private var pollCount = 0

    companion object {
        const val CHANNEL_ID = "xrp_call_service_v2"
        const val RING_CHANNEL_ID = "xrp_incoming_call_v3"
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

            try {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "XRPRoofing::CallServiceLock"
                ).apply { acquire() }
            } catch (e: Throwable) {
                android.util.Log.e(TAG, "Wake lock failed: ${e.message}")
            }

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
                    mainHandler.post { updateServiceNotification("Listening for calls ($pollCount)") }
                } catch (e: Throwable) {
                    android.util.Log.e(TAG, "Poll error: ${e.message}")
                    mainHandler.post { updateServiceNotification("Poll error: ${e.message?.take(30)}") }
                }
                // Poll every 1.5 seconds for faster detection
                try { Thread.sleep(1500) } catch (_: InterruptedException) { break }
            }
        }.apply {
            isDaemon = true
            name = "XRP-CallPoll"
            start()
        }
    }

    private fun checkForIncomingCalls() {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val sixtySecondsAgo = sdf.format(Date(System.currentTimeMillis() - 60000))

        // Poll for both ringing AND ivr-routed events
        val urlStr = "$SUPABASE_URL/rest/v1/conversation_events" +
            "?select=id,status,created_at" +
            "&status=in.(ringing,ivr-routed)" +
            "&created_at=gte.$sixtySecondsAgo" +
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
                        android.util.Log.i(TAG, "NEW CALL: $eventId")
                        lastSeenEventId = eventId
                        if (!isRinging) {
                            mainHandler.post {
                                updateServiceNotification("RINGING! Call detected")
                                triggerIncomingCall()
                            }
                        }
                    }
                } else {
                    if (isRinging) {
                        mainHandler.post { stopRinging() }
                    }
                }
            } else {
                android.util.Log.w(TAG, "API: $responseCode")
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun triggerIncomingCall() {
        android.util.Log.i(TAG, "=== TRIGGERING RING ===")
        isRinging = true

        // 1. Wake screen first
        try { wakeScreen() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Wake: ${e.message}")
        }

        // 2. Vibrate
        try { startVibration() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Vibrate: ${e.message}")
        }

        // 3. Play ringtone
        try { startRingtone() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Ringtone: ${e.message}")
        }

        // 4. Show notification with full-screen intent
        try { showIncomingCallNotification() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Notification: ${e.message}")
        }

        // 5. Launch Activity over lock screen so user can answer
        try { launchActivityOverLockScreen() } catch (e: Throwable) {
            android.util.Log.e(TAG, "Launch activity: ${e.message}")
        }

        // Auto-stop after 30 seconds
        mainHandler.postDelayed({ stopRinging() }, 30000)
    }

    private fun launchActivityOverLockScreen() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            putExtra("incoming_call", true)
        }
        startActivity(intent)
        android.util.Log.i(TAG, "Activity launched over lock screen")
    }

    private fun startVibration() {
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
        android.util.Log.i(TAG, "Vibration started")
    }

    private fun startRingtone() {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_RING)
            am.setStreamVolume(AudioManager.STREAM_RING, maxVol, 0)
        } catch (e: Throwable) {
            android.util.Log.w(TAG, "Volume set failed: ${e.message}")
        }

        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        mediaPlayer = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setDataSource(applicationContext, ringtoneUri)
            isLooping = true
            prepare()
            start()
        }
        android.util.Log.i(TAG, "Ringtone started")
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
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (_: Throwable) {}
        try {
            (getSystemService(NotificationManager::class.java)).cancel(RING_NOTIFICATION_ID)
        } catch (_: Throwable) {}
        android.util.Log.i(TAG, "Ringing stopped")
    }

    private fun wakeScreen() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        val wl = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "XRPRoofing::ScreenWake"
        )
        wl.acquire(30_000) // Keep screen on for 30 seconds
    }

    private fun showIncomingCallNotification() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("incoming_call", true)
        }
        val pi = PendingIntent.getActivity(this, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

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
            .setSound(ringtoneUri)
            .setVibrate(longArrayOf(0, 1000, 500, 1000, 500, 1000))
            .build()

        (getSystemService(NotificationManager::class.java)).notify(RING_NOTIFICATION_ID, notification)
        android.util.Log.i(TAG, "Incoming call notification shown")
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

            // Delete old channels
            try {
                nm.deleteNotificationChannel("xrp_call_service")
                nm.deleteNotificationChannel("xrp_incoming_call")
                nm.deleteNotificationChannel("xrp_incoming_call_v2")
            } catch (_: Throwable) {}

            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_ID, "Call Service", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps XRP Roofing ready to receive calls"
                setShowBadge(false)
            })

            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            nm.createNotificationChannel(NotificationChannel(
                RING_CHANNEL_ID, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for incoming phone calls"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500, 1000)
                setSound(ringtoneUri, AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build())
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

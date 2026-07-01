package com.xrproofing.crm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class CallService : Service() {

    companion object {
        const val CHANNEL_ID = "xrp_call_service"
        const val NOTIFICATION_ID = 1001

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
            createNotificationChannel()
        } catch (e: Exception) {
            android.util.Log.e("CallService", "onCreate error: ${e.message}")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val notification = buildNotification()
            startForeground(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            android.util.Log.e("CallService", "startForeground failed: ${e.message}")
            stopSelf()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Call Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps XRP Roofing ready to receive calls"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
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

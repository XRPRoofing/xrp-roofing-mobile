package com.xrproofing.crm

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CallServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "CallServiceModule"

    @ReactMethod
    fun startService(accessToken: String?) {
        val context = reactApplicationContext
        // Store token in SharedPreferences for the service to use
        if (accessToken != null) {
            context.getSharedPreferences("xrp_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString("access_token", accessToken)
                .apply()
        }
        CallService.start(context)
        requestBatteryOptimizationExemption(context)
    }

    @ReactMethod
    fun stopService() {
        val context = reactApplicationContext
        CallService.stop(context)
    }

    @ReactMethod
    fun updateToken(accessToken: String?) {
        if (accessToken != null) {
            reactApplicationContext.getSharedPreferences("xrp_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString("access_token", accessToken)
                .apply()
        }
    }

    private fun requestBatteryOptimizationExemption(context: Context) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            android.util.Log.w("CallServiceModule", "Battery opt exemption failed: ${e.message}")
        }
    }
}

package com.xrproofing.crm

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CallServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "CallServiceModule"

    @ReactMethod
    fun startService() {
        val context = reactApplicationContext
        CallService.start(context)
    }

    @ReactMethod
    fun stopService() {
        val context = reactApplicationContext
        CallService.stop(context)
    }
}

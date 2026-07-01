package com.xrproofing.crm

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    private val keepAliveHandler = Handler(Looper.getMainLooper())
    private var keepAliveRunnable: Runnable? = null

    override fun getMainComponentName(): String = "XRPRoofingMobile"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
    }

    override fun onPause() {
        super.onPause()
        // When the app goes to background, Android pauses all WebView timers.
        // Resume them immediately and keep resuming periodically to maintain
        // the Twilio WebSocket connection alive.
        startKeepAlive()
    }

    override fun onResume() {
        super.onResume()
        stopKeepAlive()
        // Ensure WebView timers are running when app comes back
        resumeWebViews()
    }

    override fun onDestroy() {
        stopKeepAlive()
        super.onDestroy()
    }

    private fun startKeepAlive() {
        stopKeepAlive()
        keepAliveRunnable = object : Runnable {
            override fun run() {
                resumeWebViews()
                keepAliveHandler.postDelayed(this, 5000) // every 5 seconds
            }
        }
        // Initial resume after a short delay (after Android finishes pausing)
        keepAliveHandler.postDelayed(keepAliveRunnable!!, 300)
    }

    private fun stopKeepAlive() {
        keepAliveRunnable?.let { keepAliveHandler.removeCallbacks(it) }
        keepAliveRunnable = null
    }

    private fun resumeWebViews() {
        try {
            val decorView = window?.decorView ?: return
            findAndResumeWebViews(decorView)
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "resumeWebViews error: ${e.message}")
        }
    }

    private fun findAndResumeWebViews(view: View) {
        if (view is WebView) {
            view.resumeTimers()
            return
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findAndResumeWebViews(view.getChildAt(i))
            }
        }
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}

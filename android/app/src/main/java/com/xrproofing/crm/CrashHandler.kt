package com.xrproofing.crm

import android.app.AlertDialog
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import java.io.PrintWriter
import java.io.StringWriter

class CrashHandler(private val context: Context) : Thread.UncaughtExceptionHandler {
    private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        val sw = StringWriter()
        throwable.printStackTrace(PrintWriter(sw))
        val stackTrace = sw.toString()
        val message = "CRASH: ${throwable.javaClass.simpleName}: ${throwable.message}\n\nStack:\n${stackTrace.take(1000)}"

        Log.e("XRPRoofing_CRASH", message)

        // Write crash to file so user can find it
        try {
            val file = context.getFileStreamPath("crash_log.txt")
            file.writeText(message)
        } catch (e: Exception) {
            // ignore
        }

        // Show toast on main thread
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, "CRASH: ${throwable.message}", Toast.LENGTH_LONG).show()
        }

        // Give toast time to show, then let default handler kill the app
        Thread.sleep(3000)
        defaultHandler?.uncaughtException(thread, throwable)
    }
}

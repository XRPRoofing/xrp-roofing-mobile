package com.xrproofing.crm

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages.toMutableList()
            // Manually add Twilio package with error handling
            try {
                val twilioPackageClass = Class.forName("com.twiliovoicereactnative.TwilioVoiceReactNativePackage")
                val twilioPackage = twilioPackageClass.getDeclaredConstructor().newInstance() as ReactPackage
                packages.add(twilioPackage)
                Log.i("XRPRoofing", "Twilio package added successfully")
            } catch (e: Exception) {
                Log.e("XRPRoofing", "Failed to load Twilio package: ${e.message}", e)
            }
            return packages
        }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = false
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)

    // Initialize Twilio Voice Application Proxy
    try {
      val proxyClass = Class.forName("com.twiliovoicereactnative.VoiceApplicationProxy")
      val constructor = proxyClass.getConstructor(Application::class.java)
      val proxy = constructor.newInstance(this)
      val onCreateMethod = proxyClass.getMethod("onCreate")
      onCreateMethod.invoke(proxy)
      Log.i("XRPRoofing", "Twilio VoiceApplicationProxy initialized successfully")
    } catch (e: Exception) {
      Log.e("XRPRoofing", "Failed to initialize Twilio VoiceApplicationProxy: ${e.message}", e)
    }
  }
}

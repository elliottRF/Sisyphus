package expo.modules.elliottrandroidtimer

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ElliottrAndroidTimerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("AndroidTimerModule")

    // The typed (P0, P1) Function overloads on the SDK 56+ expo-modules-core
    // reify the lambda's return type; a body ending in a bare `null` infers
    // R = Nothing?, which cannot be reified and throws "This function has a
    // reified type parameter" at module registration. Keep the return type Unit.
    Function("startTimer") { seconds: Int, muted: Boolean ->
      val ctx = appContext.reactContext ?: return@Function
      val intent = Intent(ctx, TimerService::class.java).apply {
        action = "start"
        putExtra("seconds", seconds)
        putExtra("muted", muted)
      }
      ctx.startForegroundService(intent)
      Unit
    }

    Function("stopTimer") {
      val ctx = appContext.reactContext ?: return@Function null
      val intent = Intent(ctx, TimerService::class.java).apply {
        action = "stop"
      }
      ctx.startService(intent)
      null
    }

    Function("getRemaining") {
      val ctx = appContext.reactContext ?: return@Function 0
      ctx
        .getSharedPreferences("timer", 0)
        .getInt("remaining", 0)
    }
  }
}

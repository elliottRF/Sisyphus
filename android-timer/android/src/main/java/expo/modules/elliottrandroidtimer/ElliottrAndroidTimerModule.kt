package expo.modules.elliottrandroidtimer

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ElliottrAndroidTimerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("AndroidTimerModule")

    Function("startTimer") { seconds: Int, muted: Boolean ->
      val ctx = appContext.reactContext ?: return@Function null
      val intent = Intent(ctx, TimerService::class.java).apply {
        action = "start"
        putExtra("seconds", seconds)
        putExtra("muted", muted)
      }
      ctx.startForegroundService(intent)
      null
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

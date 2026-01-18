package expo.modules.elliottrandroidtimer

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.util.Timer
import java.util.TimerTask
import android.media.MediaPlayer
import android.media.AudioAttributes
import android.os.Vibrator
import android.os.VibrationEffect
import android.net.Uri

class TimerService : Service() {

  private var timer: Timer? = null
  private var remaining = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(1, buildNotification(0), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(1, buildNotification(0))
    }

    when (intent?.action) {
      "start" -> {
        remaining = intent.getIntExtra("seconds", 0)
        getSharedPreferences("timer", MODE_PRIVATE)
          .edit()
          .putInt("remaining", remaining)
          .apply()
        startTimer()
      }
      "stop" -> stopSelf()
    }

    return START_STICKY
  }

  private fun startTimer() {
    timer?.cancel()
    timer = Timer()

    timer?.scheduleAtFixedRate(object : TimerTask() {
      override fun run() {
        remaining--

        getSharedPreferences("timer", MODE_PRIVATE)
          .edit()
          .putInt("remaining", remaining)
          .apply()

        if (remaining <= 0) {
          playAlert()
          stopForeground(true)
          stopSelf()
        } else {
          val nm = getSystemService(NotificationManager::class.java)
          nm.notify(1, buildNotification(remaining))
        }
      }
    }, 1000, 1000)
  }

  override fun onDestroy() {
    timer?.cancel()
    super.onDestroy()
  }

  private fun buildNotification(seconds: Int): Notification {
    return NotificationCompat.Builder(this, "timer")
      .setContentTitle("Rest Timer")
      .setContentText("Remaining: $seconds s")
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setOngoing(true)
      .build()
  }

  private fun playAlert() {
    try {
      val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(500)
      }

      val mediaPlayer = MediaPlayer.create(applicationContext, R.raw.ding)
      mediaPlayer.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      mediaPlayer.setOnCompletionListener { mp ->
        mp.release()
      }
      mediaPlayer.start()

    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        "timer",
        "Timer",
        NotificationManager.IMPORTANCE_LOW
      )
      getSystemService(NotificationManager::class.java)
        .createNotificationChannel(channel)
    }
  }
}

import android.media.SoundPool;
import android.media.AudioAttributes;
import android.os.Looper;
import android.os.Handler;

public class PlaySound {
    public static void main(String[] args) {
        if (args.length == 0) return;
        try {
            if (Looper.myLooper() == null) {
                Looper.prepare();
            }
            final String path = args[0];
            final AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            final SoundPool sp = new SoundPool.Builder()
                .setMaxStreams(1)
                .setAudioAttributes(attrs)
                .build();

            final Handler handler = new Handler(Looper.myLooper());

            // Safety timeout
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    try { sp.release(); } catch (Exception ignored) {}
                    try { Looper.myLooper().quitSafely(); } catch (Exception ignored) {}
                }
            }, 3000);

            sp.setOnLoadCompleteListener(new SoundPool.OnLoadCompleteListener() {
                @Override
                public void onLoadComplete(SoundPool soundPool, int sampleId, int status) {
                    if (status == 0) {
                        soundPool.play(sampleId, 1.0f, 1.0f, 1, 0, 1.0f);
                    }
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            try { soundPool.release(); } catch (Exception ignored) {}
                            try { Looper.myLooper().quitSafely(); } catch (Exception ignored) {}
                        }
                    }, 1200);
                }
            });

            int sid = sp.load(path, 1);
            if (sid <= 0) {
                System.out.println("LOAD_FAILED: " + path);
                sp.release();
                return;
            }
            Looper.loop();
            System.out.println("PLAY_DONE: " + path);
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }
}

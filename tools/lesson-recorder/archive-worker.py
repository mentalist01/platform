"""Local-only speech recognition. Input audio and transcript never leave this PC."""
import argparse
import json
import os
import sys

os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
os.environ.setdefault('DO_NOT_TRACK', '1')
os.environ.setdefault('OMP_NUM_THREADS', '3')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--input')
    parser.add_argument('--model', choices=['base', 'small'], default='base')
    parser.add_argument('--cache')
    args = parser.parse_args()
    from faster_whisper import WhisperModel
    if args.check:
        emit({'ready': True, 'python': sys.executable})
        return
    # A downloaded model is cached; only model weights may be fetched, never audio.
    emit({'phase': 'model'})
    model = WhisperModel(args.model, device='cpu', compute_type='int8', cpu_threads=3,
                         num_workers=1, download_root=args.cache)
    emit({'phase': 'transcribing'})
    segments, _ = model.transcribe(args.input, language='ru', beam_size=3,
                                   vad_filter=True, word_timestamps=True,
                                   condition_on_previous_text=False)
    for segment in segments:
        # Word times prevent a short sentence from spanning a long classroom silence.
        words = segment.words or []
        if not words:
            emit({'start': round(segment.start, 3), 'end': round(segment.end, 3),
                  'text': segment.text.strip()})
            continue
        group = []
        for word in words:
            if group and (word.start - group[-1].end > 2 or word.end - group[0].start > 18):
                emit({'start': round(group[0].start, 3), 'end': round(group[-1].end, 3),
                      'text': ''.join(w.word for w in group).strip()})
                group = []
            group.append(word)
        if group:
            emit({'start': round(group[0].start, 3), 'end': round(group[-1].end, 3),
                  'text': ''.join(w.word for w in group).strip()})
    emit({'done': True})

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit({'error': str(error)[:600]})
        sys.exit(1)

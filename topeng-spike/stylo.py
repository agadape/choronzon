"""TOPENG spike: can a small LOCAL LLM rewrite short messages so a stylometry attacker
can no longer tell who wrote them?

Attacker: char 2-4gram TF-IDF + LinearSVC over 10 public-domain authors (Gutenberg),
trained on ~150-word chunks from the first 70% of each book, tested on chunks from the last 30%.
Proper nouns are masked in BOTH train and test, so the attacker must rely on style, not names.

Usage:
  python3 stylo.py baseline            # attacker accuracy on raw held-out chunks
  python3 stylo.py rewrite N MODEL     # rewrite N test chunks/author via ollama, re-attack
"""
import json, random, re, sys, time, urllib.request
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC

BOOKS = {"austen": 1342, "dickens": 98, "twain": 74, "melville": 2701, "stoker": 345,
         "shelley": 84, "carroll": 11, "doyle": 1661, "wilde": 174, "london": 215}
WORDS = 150
random.seed(7)
HERE = Path(__file__).parent


def body(text):
    s = text.find("*** START OF"); e = text.find("*** END OF")
    text = text[text.find("\n", s) + 1:e] if s != -1 and e != -1 else text
    return re.sub(r"\s+", " ", text)


def mask_names(t):
    # mask capitalised words that are not sentence-initial (cheap proper-noun removal)
    return re.sub(r"(?<=[a-z,;:] )[A-Z][a-z]+", "Xx", t)


def chunks(words, n):
    return [" ".join(words[i:i + n]) for i in range(0, len(words) - n, n)]


def load():
    train, test = [], []
    for a, bid in BOOKS.items():
        w = body((HERE / "corpus" / f"{bid}.txt").read_text(encoding="utf-8", errors="ignore")).split()
        w = w[2000:]  # skip front matter
        cut = int(len(w) * 0.7)
        tr, te = chunks(w[:cut], WORDS), chunks(w[cut:], WORDS)
        train += [(a, c) for c in random.sample(tr, min(300, len(tr)))]
        test += [(a, c) for c in random.sample(te, min(60, len(te)))]
    return train, test


def fit(train):
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True, min_df=2, max_features=200000)
    X = vec.fit_transform([mask_names(t) for _, t in train])
    clf = LinearSVC(C=0.5).fit(X, [a for a, _ in train])
    return vec, clf


def acc(vec, clf, items):
    pred = clf.predict(vec.transform([mask_names(t) for _, t in items]))
    return sum(p == a for p, (a, _) in zip(pred, items)) / len(items), list(pred)


PROMPT = ("Rewrite the message below so its meaning is preserved but the writing style is completely "
          "neutral and generic: plain modern English, short simple sentences, common words, no "
          "distinctive punctuation, no archaic phrasing. Keep it about the same length. Output only "
          "the rewritten message.\n\nMESSAGE:\n{t}")


def rewrite(model, text):
    req = urllib.request.Request("http://127.0.0.1:11434/api/generate", data=json.dumps(
        {"model": model, "prompt": PROMPT.format(t=text), "stream": False,
         "options": {"temperature": 0.7, "num_predict": 320}}).encode(), headers={"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=600).read())
    return r["response"].strip(), r.get("eval_count", 0), r.get("eval_duration", 1) / 1e9


if __name__ == "__main__":
    train, test = load()
    vec, clf = fit(train)
    base, _ = acc(vec, clf, test)
    print(f"authors={len(BOOKS)} chance=10% train={len(train)} test={len(test)} chunk={WORDS}w")
    print(f"BASELINE attacker accuracy on raw held-out chunks: {base:.1%}")
    if sys.argv[1:2] == ["rewrite"]:
        n, model = int(sys.argv[2]), sys.argv[3]
        sample = []
        for a in BOOKS:
            sample += [x for x in test if x[0] == a][:n]
        raw_acc, _ = acc(vec, clf, sample)
        out, t0, toks, secs = [], time.time(), 0, 0
        for a, t in sample:
            rw, k, s = rewrite(model, t)
            out.append((a, rw)); toks += k; secs += s
        rw_acc, pred = acc(vec, clf, out)
        print(f"sample={len(sample)} raw acc={raw_acc:.1%}  ->  after {model} rewrite acc={rw_acc:.1%}")
        print(f"speed: {toks/secs:.1f} tok/s, avg {(time.time()-t0)/len(sample):.1f}s per message")
        from collections import Counter
        print("predicted label distribution after rewrite:", Counter(pred).most_common())
        Path(HERE / f"rewrites_{model.replace(':','_')}.json").write_text(json.dumps(
            [{"author": a, "orig": t, "rewrite": r} for (a, t), (_, r) in zip(sample, out)], indent=1))

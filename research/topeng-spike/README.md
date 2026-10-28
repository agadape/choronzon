# TOPENG (rejected idea) — stylometry vs local-LLM rewrite
Kept for the record. Attacker (char 2–4gram TF-IDF + LinearSVC, 10 Gutenberg authors, 150-word chunks) = 94–96.7% accuracy;
after qwen2.5:3b "neutral style" rewrite = 76.7% (chance 10%). Naive paraphrase does not hide style. See SPIKE_LOG S14.
Corpus not included: `python3 stylo.py baseline` re-downloads nothing — fetch the Gutenberg ids listed in BOOKS into corpus/ first.

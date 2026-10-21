# Prompt for writing the seed secrets

Paste this into any writing model (or hand it to a teammate). The output is the list we pre-send to the god
before the show so it is never empty. Everything sent becomes public to every key holder, forever, so the
constraints below are not style, they are safety.

```
Write 14 short confessions in English, one per line, no numbering, no quotation marks, no titles.

They are "secrets" that strangers will hear spoken by a synthetic ghost voice as part of a collective
artwork on a public blockchain, and they can never be deleted. So:

- Each line must be original (not a quote, lyric, proverb or meme) and self-contained.
- 8 to 20 words. Lowercase is fine. Plain words; one image per line; no explanations.
- First person, present or past tense, the voice of someone finally saying a small true thing out loud.
- Nothing that could identify anyone: no names, nicknames, places, companies, schools, dates, ages,
  nationalities, jobs, illnesses, or any detail that points to a real person, living or dead.
- Nothing illegal, nothing about harming anyone, nothing sexual, no slurs, no politics, no religion,
  no brands, no money amounts, no contact details or URLs.
- Tone: quiet, human, a little uncanny; the kind of sentence that stays in the room after it is said.
  Mix regret, tenderness, small lies, things kept, things never sent. Avoid melodrama and jokes.
- No two lines about the same thing. Vary sentence shapes; at most three lines may start with "i".
- Do not mention secrets, confessions, gods, ghosts, blockchains or this prompt.

Example of the register (do not reuse): "i still keep the key to a house that is no longer mine"
```

How we use the output: the team reads every line and strikes anything that could point to a real person.
Then `python3 -m kiosk offer - --from wallets/test/A --yes` per line (one shielded transaction each,
~6 s apart), and the txids go into `docs/evidence-index.md` under "pre-sent", so the demo can say honestly
which voices were there before the show.

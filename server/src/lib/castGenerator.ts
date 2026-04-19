// Voice examples for prompt differentiation — used by buildScenePrompt to
// seed each agent's section with a concrete line in their style. This is
// the ONLY live export in this file; the procedural-cast generation
// functions live client-side (client/src/lib/castGenerator.ts) since
// cast generation happens before any server call.
export const VOICE_EXAMPLES: Record<string, string> = {
  "loud and unapologetic":
    "Absolutely NOT, are you having a LAUGH? That's bare disrespectful, innit!",
  "soft-spoken but deadly honest":
    "I just think... you should know... she said she doesn't see a future with you.",
  "rapid-fire energy":
    "OhmyGOD wait wait wait — did you see his FACE when she walked in? I'm DEAD!",
  "smooth and deliberate":
    "I've been watching you all evening. And I think... you already know what I'm going to say.",
  "self-deprecating humor":
    "Right, so I tried to be smooth and I tripped over a sunbed. Classic me, honestly.",
  "warm and encouraging":
    "Babe, honestly? You deserve the world. And if he can't see that, that's HIS loss, yeah?",
  "dramatic AF":
    "*gasps* Wait. WAIT. Did she just say that? To HIS face? Oh my days, I need to sit down.",
  "cool and collected": "Interesting.",
  "excitable storyteller":
    "So THEN — and this is the mad part right — she turns around and goes 'I never liked you anyway!' and I'm stood there like—",
  "blunt Northern/Southern charm":
    "Babe, I'm gonna be straight with you. I fancy someone else. No point dragging it out, is there?",
};

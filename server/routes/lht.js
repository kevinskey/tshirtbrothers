// Live Hard Truth — the small brand-specific API surface. Commerce rides
// the shared store-shop system (store `live-hard-truth`); these endpoints
// only handle what the brand site does beyond selling:
//
//   POST /api/lht/leads          Guide download / newsletter signup. Lands
//                                in lht_leads and notifies the shop.
//   POST /api/lht/truth-session  The Truth Session: captures the lead with
//                                the answers, screens the free-text for
//                                crisis language (then answers with ONLY
//                                the 988 safety screen), and returns a
//                                deterministic Truth Color reading.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import pool from '../db.js';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || 'T-Shirt Brothers <noreply@tshirtbrothers.com>';
const SHOP_EMAIL = process.env.SHOP_NOTIFY_EMAIL || 'kevin@tshirtbrothers.com';

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again later.' },
});

const trim = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function notifyShop(subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  resend.emails.send({ from: FROM, to: SHOP_EMAIL, subject, html })
    .catch((err) => console.error('[lht] notify email failed:', err.message));
}

// ── POST /api/lht/leads ──────────────────────────────────────────────────
// Body: { first_name?, email*, consent?, source* in ('guide','newsletter') }
router.post('/leads', limiter, async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const email = trim(b.email, 255);
    const source = trim(b.source, 20);
    if (!email || !['guide', 'newsletter'].includes(source)) {
      return res.status(400).json({ error: 'email and a valid source are required' });
    }
    const firstName = trim(b.first_name, 80);
    const consent = b.consent === true;

    await pool.query(
      `INSERT INTO lht_leads (first_name, email, consent, source)
       VALUES ($1, $2, $3, $4)`,
      [firstName || null, email, consent, source],
    );

    notifyShop(
      `LHT ${source === 'guide' ? 'guide download' : 'newsletter signup'}: ${email}`,
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
        <h2 style="margin:0 0 12px;">New Live Hard Truth ${source} lead</h2>
        <p style="margin:0;font-size:14px;">${firstName ? `${firstName} — ` : ''}${email}
          ${consent ? '(opted into emails)' : '(no email consent)'}</p>
      </div>`,
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── The Truth Color reading engine ───────────────────────────────────────
// Deterministic: the six multiple-choice answers vote for one of the five
// signature colorways. No AI dependency — the readings are written once and
// personalized with the visitor's own words.

const CRISIS_RE = /suicid|kill (myself|me)|end (my|it) (life|all)|self.?harm|hurt(ing)? myself|don'?t want to (live|be here|wake up)|no reason to (live|be here)|better off dead|end it all/i;

function pickColor(a) {
  const score = { Onyx: 0, Ember: 0, Merlot: 0, Espresso: 0, Olive: 0 };

  if (a.season === 'Starting over') score.Ember += 2;
  if (a.season === 'Holding on') score.Espresso += 2;
  if (a.season === 'Healing') score.Merlot += 2;
  if (a.season === 'Rebuilding') score.Ember += 3;
  if (a.season === 'Ready to rise') score.Olive += 3;

  if (a.carrying === 'A relationship that ended') score.Merlot += 2;
  if (a.carrying === 'A loss') score.Merlot += 3;
  if (a.carrying === 'A version of me I outgrew') score.Ember += 2;
  if (a.carrying === "Other people's expectations") score.Onyx += 2;
  if (a.carrying === 'Fear of being seen') score.Onyx += 3;

  if (a.duration === 'A year or more') score.Espresso += 2;
  if (a.duration === 'Longer than I want to admit') score.Espresso += 3;
  if (a.duration === 'Weeks') score.Olive += 1;

  if (a.need === 'Permission to feel it') score.Merlot += 2;
  if (a.need === 'Courage to say it') score.Onyx += 3;
  if (a.need === 'Strength to let go') score.Espresso += 2;
  if (a.need === 'Help finding me again') score.Olive += 2;

  if (a.hiddenFrom === 'Myself') score.Espresso += 2;
  if (a.hiddenFrom === 'The world') score.Onyx += 2;

  if (a.freedom === 'Light') score.Olive += 2;
  if (a.freedom === 'Powerful') score.Ember += 2;
  if (a.freedom === 'Peaceful') score.Espresso += 1;
  if (a.freedom === 'Seen') score.Onyx += 2;

  // Stable tie-break: the order below.
  const order = ['Onyx', 'Ember', 'Merlot', 'Espresso', 'Olive'];
  return order.reduce((best, c) => (score[c] > score[best] ? c : best), 'Onyx');
}

const lcFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const READINGS = {
  Onyx: {
    reading: (n, a) => `${n}, you've been carrying ${lcFirst(a.carrying || 'something heavy')} while keeping it out of sight — and the weight of hiding has cost you more than the truth ever would. You are the Truth Teller: the season you're in is asking you to say the thing out loud, starting with the person you've hidden it from most.`,
    hardTruth: () => 'The silence is heavier than the sentence.',
    nextStep: (a) => (a.hiddenFrom === 'Myself'
      ? 'Write one true sentence about yourself and read it in the mirror, out loud, once a day.'
      : `Say one true sentence to ${lcFirst(a.hiddenFrom === 'The world' ? 'someone outside your inner circle' : a.hiddenFrom || 'someone you trust')} this week — short, honest, unpolished.`),
    affirmation: () => 'I am done hiding. My voice is mine to use.',
  },
  Ember: {
    reading: (n, a) => `${n}, ${lcFirst(a.season === 'Rebuilding' ? 'rebuilding' : 'starting over')} isn't a setback — it's proof the old version of you finished its work. You are the Rebuilder: what you're carrying (${lcFirst(a.carrying || 'the past')}) was the fire, and you're the thing that walked out of it.`,
    hardTruth: () => "What burned down wasn't your foundation. It was the scaffolding.",
    nextStep: () => 'Pick one small thing the old you kept putting off and finish it this week — rebuilding starts with one laid brick.',
    affirmation: () => 'I am rising from what burned, and I am building something truer.',
  },
  Merlot: {
    reading: (n, a) => `${n}, grief doesn't follow a schedule, and carrying ${lcFirst(a.carrying || 'this loss')} ${a.duration === 'Longer than I want to admit' ? 'for as long as you have' : `for ${(a.duration || 'months').toLowerCase()}`} is not a failure to heal — it's evidence of how real it was. You are the Healer: you're grieving and growing at the same time, and both count.`,
    hardTruth: () => "You don't have to be finished grieving to start living.",
    nextStep: () => 'Give the feeling ten unhurried minutes this week — no fixing, no judging, just letting it be felt.',
    affirmation: () => 'I am grieving and growing, and I am allowed to do both.',
  },
  Espresso: {
    reading: (n, a) => `${n}, you've held this ${a.duration === 'Weeks' ? 'for weeks' : a.duration === 'A year or more' ? 'for over a year' : 'longer than you wanted to'} — and the fact that you're still standing says everything about your roots. You are the Grounded: steadiness is your strength, but steady was never meant to mean stuck.`,
    hardTruth: () => 'Holding on this long was strength. Letting go will be too.',
    nextStep: (a) => (a.need === 'Strength to let go'
      ? 'Name one thing you are officially done carrying, and tell one person you trust that you set it down.'
      : 'Choose one small routine this week that serves who you are becoming, not who you had to be.'),
    affirmation: () => 'I am steady and rooted — and I am allowed to grow in a new direction.',
  },
  Olive: {
    reading: (n, a) => `${n}, something in you already knows the next season has started — you said it yourself: you're ${lcFirst(a.season || 'ready to rise')}. You are the Grower: the work now isn't to force the bloom, it's to stay in the light long enough to let it happen.`,
    hardTruth: () => "You're not waiting on a sign. You are the sign.",
    nextStep: () => 'Do one thing this week that the freer version of you would do — small is fine; forward is the point.',
    affirmation: (a) => `I am entering a new season, and I get to feel ${lcFirst(a.freedom || 'light')} in it.`,
  },
};

// ── POST /api/lht/truth-session ──────────────────────────────────────────
// Body: { first_name*, email*, consent?, answers{season,carrying,duration,
//         need,hiddenFrom,freedom,truth?} }
router.post('/truth-session', limiter, async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const firstName = trim(b.first_name, 60);
    const email = trim(b.email, 255);
    if (!firstName || !email) {
      return res.status(400).json({ error: 'first_name and email are required' });
    }
    const raw = b.answers ?? {};
    const answers = {
      season: trim(raw.season, 60),
      carrying: trim(raw.carrying, 80),
      duration: trim(raw.duration, 60),
      need: trim(raw.need, 60),
      hiddenFrom: trim(raw.hiddenFrom, 60),
      freedom: trim(raw.freedom, 60),
      truth: trim(raw.truth, 400),
    };
    const consent = b.consent === true;

    // Crisis language in the free-text answer short-circuits everything:
    // no reading, no upsell — only the 988 screen.
    const safety = CRISIS_RE.test(answers.truth);
    const color = safety ? null : pickColor(answers);

    await pool.query(
      `INSERT INTO lht_leads (first_name, email, consent, source, answers_json, truth_color)
       VALUES ($1, $2, $3, 'truth', $4::jsonb, $5)`,
      [firstName, email, consent, JSON.stringify(answers), color],
    );

    if (safety) {
      notifyShop(
        'LHT Truth Session — safety screen shown',
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
          <p style="font-size:14px;">A Truth Session visitor (${firstName}, ${email}) wrote something that
          triggered the crisis screen. They were shown the 988 lifeline message.</p>
        </div>`,
      );
      return res.json({ safety: true });
    }

    const t = READINGS[color];
    res.json({
      safety: false,
      color,
      reading: {
        reading: t.reading(firstName, answers),
        hardTruth: t.hardTruth(answers),
        nextStep: t.nextStep(answers),
        affirmation: t.affirmation(answers),
      },
    });
  } catch (err) { next(err); }
});

export default router;

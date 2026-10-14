import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

// Required for the iOS App Store listing (Apple rejects apps without a
// working privacy policy URL), and the footer has linked /privacy since
// the redesign — this page finally answers it.

const EFFECTIVE_DATE = 'October 14, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-display font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600 leading-relaxed text-[15px]">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <Layout>
      <Seo
        title="Privacy Policy · TShirt Brothers"
        description="How T-Shirt Brothers collects, uses, and protects your information across our website and iOS app."
        path="/privacy"
      />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Effective {EFFECTIVE_DATE}</p>

        <Section title="Who we are">
          <p>
            T-Shirt Brothers is a custom apparel printing shop at 6010 Renaissance Parkway,
            Fairburn, GA 30213. This policy covers tshirtbrothers.com, our related storefronts,
            and the T-Shirt Brothers iOS app (together, the &ldquo;Services&rdquo;).
          </p>
        </Section>

        <Section title="What we collect">
          <p>
            <strong>Information you give us:</strong> your name, email address, phone number, and
            shipping address when you request a quote, place an order, or create an account; the
            artwork and design files you upload; sizes and product choices; and messages you send
            us by email, text, or through the site.
          </p>
          <p>
            <strong>Information collected automatically:</strong> basic usage data such as pages
            visited and device type, used to keep the site working and understand what customers
            need. We do not sell this data or use it for cross-site advertising.
          </p>
          <p>
            <strong>Payment information:</strong> payments are processed by Stripe. Your card
            number goes directly to Stripe and never touches our servers; we receive only a
            confirmation and the last four digits for receipts.
          </p>
        </Section>

        <Section title="How we use it">
          <p>
            To prepare quotes and mockups, produce and deliver your order, send receipts and order
            updates, answer your questions, and keep records required for accounting. With your
            consent we may also send occasional promotional email — every message includes an
            unsubscribe link.
          </p>
        </Section>

        <Section title="Text messages">
          <p>
            If you give us your phone number, we send transactional texts about your order (quote
            ready, mockup approval, order ready). Reply STOP at any time to opt out. Message and
            data rates may apply.
          </p>
        </Section>

        <Section title="The iOS app and push notifications">
          <p>
            The T-Shirt Brothers app offers push notifications for order updates. Notifications
            are optional — iOS asks for your permission first, and you can turn them off any time
            in Settings. If you allow them, we store a device token tied to your account solely to
            deliver those notifications. Signing out or deleting the app stops them.
          </p>
        </Section>

        <Section title="Who we share with">
          <p>We share information only with service providers who help us run the business:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Stripe (payment processing)</li>
            <li>Twilio (text messages)</li>
            <li>Resend and Purelymail (email delivery)</li>
            <li>EasyPost and shipping carriers (delivery and tracking)</li>
            <li>Apparel suppliers and print vendors (only what&rsquo;s needed to produce and ship your order)</li>
            <li>DigitalOcean (hosting and file storage)</li>
          </ul>
          <p>
            Each provider receives only what it needs to do its job. We never sell your personal
            information.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Order and quote records are kept as long as we need them for warranty, reprints, and
            accounting. Uploaded artwork is kept so we can reprint your past orders. You can ask us
            to delete your account or artwork at any time (see below).
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc pl-6 space-y-1">
            <li>Ask for a copy of the personal information we hold about you.</li>
            <li>Ask us to correct or delete it (we may keep what the law requires, like invoices).</li>
            <li>Unsubscribe from marketing email, reply STOP to texts, or disable push notifications.</li>
          </ul>
          <p>
            To exercise any of these, email{' '}
            <a href="mailto:kevin@tshirtbrothers.com" className="text-orange-600 hover:underline">
              kevin@tshirtbrothers.com
            </a>{' '}
            or call (470) 622-1392.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Our Services are for general audiences and not directed at children under 13. We do not
            knowingly collect personal information from children.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make material changes, we&rsquo;ll update the effective date above and, for
            significant changes, tell account holders by email.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            T-Shirt Brothers · 6010 Renaissance Parkway, Fairburn, GA 30213 ·{' '}
            <a href="mailto:kevin@tshirtbrothers.com" className="text-orange-600 hover:underline">
              kevin@tshirtbrothers.com
            </a>{' '}
            · (470) 622-1392
          </p>
        </Section>
      </div>
    </Layout>
  );
}

import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

// The footer and the signup form have linked /terms since the redesign, but
// no terms page ever existed — the link 404'd (and crawlers got the homepage
// head via the SPA fallback). Every figure here traces to already-published
// copy (/faq, /privacy, the quote wizard, the embroidery page); where the
// business hedges, these terms hedge.

const EFFECTIVE_DATE = 'October 28, 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-display font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600 leading-relaxed text-[15px]">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <Layout>
      <Seo
        title="Terms of Service · TShirt Brothers"
        description="The terms that govern quotes, orders, artwork, turnaround, payment, and returns at T-Shirt Brothers in Fairburn, GA."
        path="/terms"
      />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Effective {EFFECTIVE_DATE}</p>

        <Section title="Who we are">
          <p>
            T-Shirt Brothers is a custom apparel printing shop at 6010 Renaissance Parkway,
            Fairburn, GA 30213 — phone (470) 622-1392. These terms cover tshirtbrothers.com, our
            related storefronts, and the T-Shirt Brothers iOS app (together, the
            &ldquo;Services&rdquo;). By requesting a quote, placing an order, or creating an
            account, you agree to them.
          </p>
        </Section>

        <Section title="Quotes and pricing">
          <p>
            A quote is an estimate based on the product, quantity, decoration method, and artwork
            you describe. It becomes a binding price only when we confirm your order. Quoted
            prices can change if the garment, quantity, artwork, or timeline changes. Georgia
            sales tax applies where required.
          </p>
        </Section>

        <Section title="Artwork and approval">
          <p>
            You are responsible for the content you ask us to print. By submitting artwork you
            confirm you own it or have permission to use it, and you agree to cover us if someone
            claims otherwise. We do not print trademarked or licensed material — school marks,
            league logos, brand logos — without authorization from the owner, and we may decline
            any order at our discretion.
          </p>
          <p>
            For most orders we send a mockup or proof before production. Once you approve it, we
            print what you approved — please check spelling, names, numbers, colors, and placement
            carefully, because errors that appear in an approved proof are not eligible for a free
            reprint.
          </p>
        </Section>

        <Section title="Turnaround and delivery">
          <p>
            Standard turnaround is typically 2–7 business days from approval, depending on the
            method and current workload; rush options are available on many orders for an
            additional charge. Turnaround estimates are good-faith estimates, not guarantees,
            unless we confirm a date in writing. Local pickup in Fairburn is free. Shipped orders
            travel at the carrier&rsquo;s risk once handed off; we will help you file a claim for
            carrier loss or damage.
          </p>
        </Section>

        <Section title="Payment">
          <p>
            Payments are processed by Stripe; we never see or store your card number. Some orders
            require a deposit before production (for example, embroidery orders include a
            digitization deposit) with the balance due on delivery or pickup. Orders placed
            through our online stores are charged at checkout. Custom work doesn&rsquo;t begin
            until any required deposit is paid.
          </p>
        </Section>

        <Section title="Returns and reprints">
          <p>
            Because every order is made to your specifications, custom items can&rsquo;t be
            returned for a refund the way off-the-shelf goods can. If we made a mistake — the
            wrong garment, a misprint that doesn&rsquo;t match your approved proof, or a
            manufacturing defect — tell us within 7 days of receiving the order and we will
            reprint the affected items or refund them, our choice. Normal variation in garment
            dye lots and slight placement tolerance are part of custom printing and not defects.
          </p>
        </Section>

        <Section title="Group and partner stores">
          <p>
            Some storefronts on our Services are run with schools, teams, businesses, and
            organizations. Orders placed in those stores are produced and fulfilled by T-Shirt
            Brothers under these same terms; any fundraising contribution shown at checkout goes
            to the named organization.
          </p>
        </Section>

        <Section title="Accounts">
          <p>
            Keep your account credentials to yourself; you are responsible for activity under
            your account. We may suspend accounts used for fraud, abuse, or automated signups.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            Our responsibility for any order is limited to the amount you paid for it. We are not
            liable for indirect or consequential damages, including missed events, to the extent
            Georgia law allows that limitation.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            We may update these terms; the effective date above always reflects the current
            version, and continued use of the Services means you accept the update. Questions?
            Email <a href="mailto:info@tshirtbrothers.com" className="text-orange-600">info@tshirtbrothers.com</a> or
            call <a href="tel:+14706221392" className="text-orange-600">(470) 622-1392</a>. These
            terms are governed by the laws of the State of Georgia.
          </p>
        </Section>
      </div>
    </Layout>
  );
}

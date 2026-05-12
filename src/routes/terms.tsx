import { createFileRoute } from "@tanstack/react-router";

import {
  LegalAddress,
  LegalArticle,
  LegalShell,
  LegalUpdated,
} from "@/components/landing/legal-shell";
import { SITE_URL } from "@/components/landing/seo-data";
import {
  META_PIXEL_HEAD_SCRIPTS,
  MetaPixelNoScript,
} from "@/lib/meta-pixel";

export const Route = createFileRoute("/terms")({
  ssr: true,
  head: () => ({
    meta: [
      { title: "Terms of Service — Cloudstash" },
      {
        name: "description",
        content:
          "The terms that apply when you use Cloudstash to save and summarize links.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/terms` }],
    scripts: [...META_PIXEL_HEAD_SCRIPTS],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms of Service"
      lead="The agreement between you and Cloudstash when you save links with us."
    >
      <LegalArticle>
        <LegalUpdated date="May 12, 2026" />
        <p>
          These terms are an agreement between you and Phantom Edtech LLC about
          your use of Cloudstash. We’ve kept them short. If something here
          doesn’t make sense, email{" "}
          <a href="mailto:support@cloudstash.dev">support@cloudstash.dev</a> and
          we’ll explain.
        </p>

        <section id="who">
          <h2>1. Who you’re dealing with</h2>
          <p>
            Cloudstash is provided by Phantom Edtech LLC, a Wyoming limited
            liability company:
          </p>
          <LegalAddress />
          <p>When we say “we,” “us,” or “Cloudstash,” that’s who we mean.</p>
        </section>

        <section id="account">
          <h2>2. Your account</h2>
          <p>
            You need an account to use Cloudstash. To create one, you sign in
            with Google. You must be at least 13 years old (or 16 if you live in
            the EU, unless your country allows a lower age).
          </p>
          <p>
            You’re responsible for what happens on your account. Keep your
            Google login safe. If you think someone else got in, tell us
            immediately.
          </p>
          <p>
            One person, one account. Don’t create accounts in someone else’s
            name.
          </p>
          <p>
            Cloudstash is built and sold for customers in the United States.
            You’re welcome to use it from elsewhere, but the service, support,
            and these terms are designed around US law. If you sign up from
            outside the US, you’re doing so on your own initiative.
          </p>
        </section>

        <section id="what-it-does">
          <h2>3. What Cloudstash does</h2>
          <p>
            Cloudstash lets you save links and generates short AI summaries of
            them so you can search and find them later. We may add, change, or
            remove features as we go.
          </p>
        </section>

        <section id="your-content">
          <h2>4. Your content</h2>
          <p>
            Everything you save belongs to you. We don’t claim ownership of your
            links, your tags, your notes, or the summaries we generate for you.
          </p>
          <p>
            To run the service, you grant us a worldwide, non-exclusive,
            royalty-free license to host, store, process, transmit, display, and
            back up your content solely for the purpose of providing Cloudstash
            to you. This license ends when you delete the content or your
            account.
          </p>
          <p>
            You’re responsible for what you save. By saving content to
            Cloudstash, you represent that you have the right to do so
            (including any copyright, privacy, or contractual permissions you
            need). Don’t save anything you don’t have the right to save.
          </p>
        </section>

        <section id="ai">
          <h2>5. AI summaries and chat</h2>
          <p>
            When you save a link, we send its content to Cloudflare’s Workers AI
            service (currently using Meta’s Llama 3.3 model) to generate a
            summary. The Pro chat-with-your-archive feature is different: it
            sends your messages through OpenRouter to Google’s Gemini model.
          </p>
          <p>
            AI gets things wrong. Summaries and chat responses can be
            inaccurate, incomplete, biased, or out of date. Treat them as a
            starting point, not the final word. Don’t rely on them for legal,
            medical, financial, or other important decisions. We’re not
            responsible for what you do based on AI output.
          </p>
        </section>

        <section id="acceptable-use">
          <h2>6. Acceptable use</h2>
          <p>Don’t:</p>
          <ul>
            <li>
              Save, store, or transmit content that’s illegal, infringes someone
              else’s rights, or violates someone else’s privacy.
            </li>
            <li>Use Cloudstash to harass, threaten, defame, or harm anyone.</li>
            <li>
              Try to break, overload, reverse-engineer, scrape, or probe the
              service.
            </li>
            <li>
              Use bots or automated systems beyond our official APIs and
              integrations.
            </li>
            <li>
              Resell, sublicense, or white-label Cloudstash without our written
              permission.
            </li>
            <li>Impersonate someone else.</li>
            <li>Save content from sites that prohibit it.</li>
          </ul>
          <p>
            If we believe you’re doing any of the above, we may suspend or close
            your account.
          </p>
        </section>

        <section id="billing">
          <h2>7. Plans, billing, and refunds</h2>
          <p>
            Cloudstash has a free plan and paid plans (Plus at $5/month and Pro
            at $12/month). Current pricing and what’s included is at{" "}
            <a href="/#pricing">cloudstash.dev/#pricing</a>.
          </p>
          <p>
            <strong>Billing.</strong> Paid plans bill monthly in advance through
            our payment processor, Stripe. Your card details go directly to
            Stripe and are never stored by Cloudstash. Subscriptions renew
            automatically until you cancel them. You can cancel any time from
            Settings — your plan stays active through the end of the billing
            period you’ve already paid for.
          </p>
          <p>
            <strong>Taxes.</strong> Prices don’t include applicable taxes (sales
            tax, VAT, GST). If we have to collect tax, we’ll add it on top.
          </p>
          <p>
            <strong>Price changes.</strong> If we change the price, we’ll email
            you at least 30 days in advance. The new price takes effect on your
            next renewal — if you don’t want to pay it, you can cancel before
            then.
          </p>
          <p>
            <strong>Refunds.</strong> Subscriptions are non-refundable. If you
            cancel mid-cycle, your plan stays active through the end of the
            period you’ve already paid for — we don’t prorate or refund unused
            time. If something goes seriously wrong on our end (for example, a
            prolonged outage), email{" "}
            <a href="mailto:support@cloudstash.dev">support@cloudstash.dev</a>{" "}
            within 14 days and we may, at our discretion, issue a credit.
          </p>
        </section>

        <section id="integrations">
          <h2>8. Third-party integrations</h2>
          <p>
            Cloudstash works with Google, Telegram, Raycast, and others. Those
            services have their own terms and policies. We’re not responsible
            for what they do or don’t do, and we can’t keep an integration
            working if a third party changes or removes the underlying API.
          </p>
        </section>

        <section id="closing">
          <h2>9. Closing your account</h2>
          <p>
            You can delete your account at any time from Settings → Account →
            Delete. That wipes your archive immediately and we don’t keep a
            copy. See the <a href="/privacy">Privacy Policy</a> for the full
            retention details.
          </p>
          <p>
            We may suspend or close your account if you violate these terms, if
            we’re required to by law, if we’re shutting Cloudstash down, or if
            your free account has been inactive for 12 months or more. We’ll
            give you reasonable notice where we can, except in cases of abuse or
            legal emergency.
          </p>
        </section>

        <section id="availability">
          <h2>10. Service availability</h2>
          <p>
            We try to keep Cloudstash up and running, but we don’t promise it’ll
            be available without interruption. Things break. We do our best.
          </p>
        </section>

        <section id="beta">
          <h2>11. Beta and experimental features</h2>
          <p>
            We sometimes ship features marked “beta,” “experimental,” or
            similar. Those are exactly what they sound like — use them at your
            own risk, and don’t be surprised if they change or disappear.
          </p>
        </section>

        <section id="ip">
          <h2>12. Intellectual property</h2>
          <p>
            Cloudstash, its name, branding, design, and code are ours (or our
            licensors’). These terms don’t give you any rights to use our
            trademarks, logos, or branding.
          </p>
        </section>

        <section id="dmca">
          <h2>13. Copyright complaints (DMCA)</h2>
          <p>
            If you believe content saved on Cloudstash infringes your copyright,
            send a DMCA notice to{" "}
            <a href="mailto:support@cloudstash.dev">support@cloudstash.dev</a>{" "}
            with:
          </p>
          <ul>
            <li>Your contact information.</li>
            <li>A description of the work you say is infringed.</li>
            <li>
              The Cloudstash content you’re complaining about (a URL helps).
            </li>
            <li>
              A statement of good-faith belief that the use isn’t authorized.
            </li>
            <li>
              A statement, under penalty of perjury, that the information is
              accurate and you’re authorized to act on the rights holder’s
              behalf.
            </li>
            <li>Your physical or electronic signature.</li>
          </ul>
          <p>
            We respond to valid DMCA notices and may close repeat-infringer
            accounts.
          </p>
        </section>

        <section id="disclaimers">
          <h2>14. Disclaimers</h2>
          <p>
            Cloudstash is provided “as is” and “as available.” To the maximum
            extent permitted by law, we disclaim all warranties — express,
            implied, or statutory — including merchantability, fitness for a
            particular purpose, non-infringement, accuracy, and that the service
            will be uninterrupted or error-free.
          </p>
        </section>

        <section id="liability">
          <h2>15. Limitation of liability</h2>
          <p>To the maximum extent allowed by law:</p>
          <ul>
            <li>
              We’re not liable for indirect, incidental, consequential, special,
              or punitive damages, including lost profits, lost data, or
              business interruption.
            </li>
            <li>
              Our total liability to you for any claim related to Cloudstash is
              capped at the greater of (a) the amount you paid us in the 12
              months before the claim arose, or (b) US $100.
            </li>
          </ul>
          <p>
            Some jurisdictions don’t allow these limits — if you live in one,
            the parts that the law doesn’t allow won’t apply to you, but the
            rest still will.
          </p>
        </section>

        <section id="indemnification">
          <h2>16. Indemnification</h2>
          <p>
            You agree to defend and indemnify Phantom Edtech LLC and our team
            from claims, damages, losses, and reasonable legal costs arising out
            of (a) your content, (b) your use of Cloudstash, or (c) your
            violation of these terms or someone else’s rights.
          </p>
        </section>

        <section id="law">
          <h2>17. Governing law and disputes</h2>
          <p>
            These terms are governed by the laws of the State of Wyoming, USA,
            without regard to its conflict-of-law rules. The exclusive venue for
            any dispute is the state courts of Laramie County, Wyoming or the
            United States District Court for the District of Wyoming, and you
            and we both consent to that jurisdiction.
          </p>
          <p>
            Before filing anything, we both agree to try to resolve disputes
            informally by emailing{" "}
            <a href="mailto:support@cloudstash.dev">support@cloudstash.dev</a>.
            If we can’t sort it out within 30 days, either of us can go to
            court.
          </p>
          <p>
            If you live in the EU or UK, nothing here removes mandatory consumer
            rights you have under your local law, and you can still bring
            proceedings in your country of residence.
          </p>
        </section>

        <section id="changes">
          <h2>18. Changes to these terms</h2>
          <p>
            We may update these terms. If we make material changes, we’ll email
            you and post a notice in-app at least 30 days before they take
            effect. If you keep using Cloudstash after that, you’ve accepted the
            new terms. If you don’t agree, delete your account before the change
            takes effect.
          </p>
        </section>

        <section id="misc">
          <h2>19. Other stuff</h2>
          <ul>
            <li>
              If a part of these terms is unenforceable, the rest still applies.
            </li>
            <li>
              Our not enforcing something doesn’t waive our right to enforce it
              later.
            </li>
            <li>
              You can’t transfer these terms to someone else. We can transfer
              them as part of a merger, acquisition, or sale of Cloudstash, with
              notice to you.
            </li>
            <li>
              These terms are the entire agreement between you and us about
              Cloudstash.
            </li>
            <li>
              Legal notices to Cloudstash must be sent by email to{" "}
              <a href="mailto:support@cloudstash.dev">support@cloudstash.dev</a>{" "}
              and by mail to Phantom Edtech LLC at the address above. We send
              legal notices to you by email at the address on your account.
            </li>
          </ul>
        </section>

        <section id="contact">
          <h2>20. Contact</h2>
          <p>
            Questions? Email{" "}
            <a href="mailto:support@cloudstash.dev">support@cloudstash.dev</a>.
          </p>
          <LegalAddress />
        </section>
      </LegalArticle>
      <MetaPixelNoScript />
    </LegalShell>
  );
}

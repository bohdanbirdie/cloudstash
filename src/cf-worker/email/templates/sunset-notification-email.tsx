import { Body } from "@react-email/body";
import { Button } from "@react-email/button";
import { Container } from "@react-email/container";
import { Font } from "@react-email/font";
import { Head } from "@react-email/head";
import { Heading } from "@react-email/heading";
import { Html } from "@react-email/html";
import { Preview } from "@react-email/preview";
import { Section } from "@react-email/section";
import { Tailwind } from "@react-email/tailwind";
import { Text } from "@react-email/text";

import { hexColors } from "@/lib/colors";

export interface SunsetNotificationEmailProps {
  name: string | null;
  deadlineDate: string;
  appUrl: string;
}

const tailwindConfig = {
  theme: {
    extend: {
      colors: {
        primary: hexColors.primary,
        "primary-foreground": hexColors.primaryForeground,
        muted: hexColors.muted,
        "muted-foreground": hexColors.mutedForeground,
        border: hexColors.border,
      },
    },
  },
};

const fontStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  color: hexColors.foreground,
};

export function SunsetNotificationEmail({
  name,
  deadlineDate,
  appUrl,
}: SunsetNotificationEmailProps) {
  const displayName = name || "there";

  return (
    <Html>
      <Head>
        <Font
          fontFamily="JetBrains Mono"
          fallbackFontFamily="monospace"
          webFont={{
            url: "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2",
            format: "woff2",
          }}
        />
      </Head>
      <Preview>Some exciting news — CloudStash is going open-source!</Preview>
      <Tailwind config={tailwindConfig}>
        <Body
          className="font-mono"
          style={{ backgroundColor: hexColors.muted }}
        >
          <Container className="mx-auto py-8 px-4">
            <Section
              className="bg-white p-6"
              style={{ border: `1px solid ${hexColors.border}` }}
            >
              <Heading
                className="text-base font-semibold mb-4"
                style={fontStyle}
              >
                CloudStash is going open-source!
              </Heading>

              <Text className="text-xs mb-3 leading-relaxed" style={fontStyle}>
                Hey {displayName},
              </Text>

              <Text className="text-xs mb-3 leading-relaxed" style={fontStyle}>
                CloudStash is going open-source! The full source code is now
                publicly available at{" "}
                <a
                  href="https://github.com/bohdanbirdie/cloudstash"
                  style={{ color: hexColors.primary }}
                >
                  github.com/bohdanbirdie/cloudstash
                </a>
                .
              </Text>

              <Text className="text-xs mb-3 leading-relaxed" style={fontStyle}>
                All accounts on the hosted instance at cloudstash.dev will be
                suspended on <strong>{deadlineDate}</strong>. Please log in and
                export your saved links before then.
              </Text>

              <Text className="text-xs mb-5 leading-relaxed" style={fontStyle}>
                Want to keep using CloudStash? You can deploy your own instance
                to Cloudflare in one click using the "Deploy to Cloudflare"
                button in the repo.
              </Text>

              <Button
                href={appUrl}
                style={{
                  backgroundColor: hexColors.primary,
                  color: hexColors.primaryForeground,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "12px",
                  fontWeight: 500,
                  padding: "8px 16px",
                  border: "1px solid transparent",
                }}
              >
                Export My Links
              </Button>
            </Section>

            <Text
              className="text-center mt-4"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "10px",
                color: hexColors.mutedForeground,
              }}
            >
              CloudStash - Save and organize your links
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default SunsetNotificationEmail;

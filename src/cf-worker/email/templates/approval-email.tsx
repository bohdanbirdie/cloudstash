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

export interface ApprovalEmailProps {
  name: string | null;
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

export function ApprovalEmail({ name }: ApprovalEmailProps) {
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
      <Preview>Your CloudStash account has been approved!</Preview>
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
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: hexColors.foreground,
                }}
              >
                Welcome to CloudStash!
              </Heading>

              <Text
                className="text-xs mb-3 leading-relaxed"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: hexColors.foreground,
                }}
              >
                Hi {displayName},
              </Text>

              <Text
                className="text-xs mb-3 leading-relaxed"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: hexColors.foreground,
                }}
              >
                Great news! Your CloudStash account has been approved.
              </Text>

              <Text
                className="text-xs mb-5 leading-relaxed"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: hexColors.foreground,
                }}
              >
                You can now start saving and organizing your links.
              </Text>

              <Button
                href="https://cloudstash.dev"
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
                Go to CloudStash
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

export default ApprovalEmail;

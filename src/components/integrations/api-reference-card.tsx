import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  LockIcon,
  TerminalIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { IconSwap } from "@/components/right-pane/headers/icon-swap";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useFlashFlag } from "@/hooks/use-flash-flag";
import { useOrgFeatures } from "@/hooks/use-org-features";

import type { ApiEndpoint, ApiError, ApiField } from "./api-spec";
import { API_ENDPOINTS, apiOrigin, buildAgentSpec } from "./api-spec";

interface CopyButtonProps {
  value: string;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  variant?: "outline" | "ghost";
  size?: "sm" | "icon-sm";
  className?: string;
}

function CopyLabel({
  active,
  label,
  copiedLabel,
}: {
  active: boolean;
  label: string;
  copiedLabel: string;
}) {
  const text = active ? copiedLabel : label;
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const el = sizerRef.current;
    if (el) setWidth(el.getBoundingClientRect().width);
  }, [text]);

  return (
    <motion.span
      className="relative inline-block overflow-hidden"
      animate={width === undefined ? {} : { width }}
      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
    >
      <span ref={sizerRef} className="inline-block whitespace-nowrap opacity-0">
        {text}
      </span>
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          aria-hidden
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(4px)" }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
          className="absolute inset-0 flex items-center whitespace-nowrap"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  ariaLabel,
  variant = "outline",
  size = "sm",
  className,
}: CopyButtonProps) {
  const { active, trigger } = useFlashFlag();
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label == null ? ariaLabel : undefined}
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        trigger();
      }}
    >
      <IconSwap iconKey={active ? "copied" : "copy"}>
        {active ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
      </IconSwap>
      {label != null && (
        <CopyLabel active={active} label={label} copiedLabel={copiedLabel} />
      )}
    </Button>
  );
}

function CodeSnippet({ code, ariaLabel }: { code: string; ariaLabel: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2.5 pr-10 font-mono text-xs leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
      <CopyButton
        value={code}
        ariaLabel={ariaLabel}
        variant="ghost"
        size="icon-sm"
        className="absolute right-1.5 top-1.5 text-muted-foreground hover:bg-foreground/10 dark:hover:bg-foreground/10"
      />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function FieldDl({ fields }: { fields: ApiField[] }) {
  return (
    <dl className="space-y-2">
      {fields.map((f) => (
        <div key={f.name} className="text-xs">
          <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <code className="font-mono text-foreground">{f.name}</code>
            <span className="font-mono text-[0.625rem] text-muted-foreground">
              {f.type}
            </span>
            {f.required && (
              <span className="text-[0.625rem] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                required
              </span>
            )}
          </dt>
          <dd className="mt-0.5 text-muted-foreground">{f.description}</dd>
        </div>
      ))}
    </dl>
  );
}

function ParamList({ title, fields }: { title: string; fields: ApiField[] }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{title}</FieldLabel>
      <FieldDl fields={fields} />
    </div>
  );
}

function ErrorList({ errors }: { errors: ApiError[] }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>Errors</FieldLabel>
      <ul className="space-y-1">
        {errors.map((e) => (
          <li key={e.status} className="flex gap-2 text-xs">
            <code className="font-mono tabular-nums text-muted-foreground">
              {e.status}
            </code>
            <span className="text-muted-foreground">{e.when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResponseFields({ endpoint }: { endpoint: ApiEndpoint }) {
  if (!endpoint.responseFields) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group/rf flex w-full items-center gap-1.5 rounded-md py-1 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
        <ChevronRightIcon className="size-3 transition-transform group-data-[panel-open]/rf:rotate-90" />
        Response fields ({endpoint.responseFields.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <FieldDl fields={endpoint.responseFields} />
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          <code className="font-mono text-foreground">total</code> is the count
          of the whole filtered set.{" "}
          <code className="font-mono text-foreground">nextCursor</code> is an
          opaque token — keep passing it back until it&apos;s{" "}
          <code className="font-mono text-foreground">null</code> to page
          through everything.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EndpointBody({
  endpoint,
  origin,
}: {
  endpoint: ApiEndpoint;
  origin: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {endpoint.description}
      </p>

      {endpoint.query && (
        <ParamList title="Query parameters" fields={endpoint.query} />
      )}
      {endpoint.body && (
        <ParamList title="Request body" fields={endpoint.body} />
      )}

      <div className="space-y-1.5">
        <FieldLabel>Request</FieldLabel>
        <CodeSnippet
          code={endpoint.curl(origin)}
          ariaLabel={`Copy ${endpoint.method} ${endpoint.path} request`}
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Response</FieldLabel>
        <CodeSnippet
          code={endpoint.response}
          ariaLabel="Copy example response"
        />
      </div>

      <ResponseFields endpoint={endpoint} />

      <ErrorList errors={endpoint.errors} />
    </div>
  );
}

function Quickstart({ origin }: { origin: string }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <FieldLabel>Base URL</FieldLabel>
        <CodeSnippet code={origin} ariaLabel="Copy base URL" />
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Authentication</FieldLabel>
        <CodeSnippet
          code="Authorization: Bearer <API_KEY>"
          ariaLabel="Copy authentication header"
        />
        <p className="text-xs text-muted-foreground">
          Send this header on every request. Generate a key above.
        </p>
      </div>
    </div>
  );
}

export function ApiReferenceCard() {
  const { capabilities } = useOrgFeatures();
  const origin = apiOrigin();
  const requiresUpgrade = !capabilities.publicApi;
  const agentSpec = useMemo(() => buildAgentSpec(origin), [origin]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TerminalIcon className="size-3.5" />
          API reference
        </CardTitle>
        <CardDescription>
          Read and save links programmatically with an API key.
        </CardDescription>
        {!requiresUpgrade && (
          <CardAction>
            <CopyButton
              value={agentSpec}
              label="Copy for agents"
              copiedLabel="Spec copied"
              ariaLabel="Copy the full API spec"
            />
          </CardAction>
        )}
      </CardHeader>

      <CardContent>
        {requiresUpgrade ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockIcon className="size-3 shrink-0" aria-hidden />
            The Public API is available on Plus &amp; Pro. Upgrade above to get
            a key and call these endpoints.
          </p>
        ) : (
          <div className="space-y-4">
            <Quickstart origin={origin} />
            <Accordion className="border-t border-border">
              {API_ENDPOINTS.map((endpoint) => (
                <AccordionItem key={endpoint.id} value={endpoint.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge
                        variant={
                          endpoint.method === "GET" ? "secondary" : "default"
                        }
                        className="font-mono"
                      >
                        {endpoint.method}
                      </Badge>
                      <code className="font-mono text-xs text-foreground">
                        {endpoint.path}
                      </code>
                      <span className="text-xs font-normal text-muted-foreground">
                        {endpoint.summary}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <EndpointBody endpoint={endpoint} origin={origin} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

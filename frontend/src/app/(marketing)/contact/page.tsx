"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail } from "lucide-react";
import {
  MarketingSection,
  MarketingSectionIntro,
  MarketingShell,
} from "@/components/marketing/marketing-section";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = (await res.json()) as { message?: string; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message || "Could not send message");
      }
      setFeedback({ type: "success", text: data.message || "Message sent." });
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not send message",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingShell className="max-w-lg">
      <MarketingSection className="marketing-section--tight">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <MarketingSectionIntro
          title="Contact"
          titleAs="h1"
          description="Questions, demo requests, or partnership ideas — send us a note."
        />

        <div className="bento-tile-strong rounded-2xl">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="name" className="text-foreground">
                Name
              </Label>
              <Input
                id="name"
                className="mt-1.5"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="email" className="text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                className="mt-1.5"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="message" className="text-foreground">
                Message
              </Label>
              <Textarea
                id="message"
                className="mt-1.5"
                rows={5}
                placeholder="What would you like to talk about?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={10}
              />
            </div>
            {feedback && (
              <p
                role={feedback.type === "error" ? "alert" : "status"}
                aria-live="polite"
                className={
                  feedback.type === "success"
                    ? "text-sm text-success"
                    : "text-sm text-destructive"
                }
              >
                {feedback.text}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send message"}
            </Button>
          </form>
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}

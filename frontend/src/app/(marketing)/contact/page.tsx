import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Contact</h1>
        <p className="mt-3 text-muted">Reach out for demos, feedback, or partnership inquiries.</p>
      </div>

      {/* Form card */}
      <div className="bento-tile-strong rounded-2xl">
        <form className="space-y-5">
          <div>
            <Label htmlFor="name" className="text-foreground">Name</Label>
            <Input id="name" className="mt-1.5" placeholder="Your name" />
          </div>
          <div>
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input id="email" type="email" className="mt-1.5" placeholder="you@company.com" />
          </div>
          <div>
            <Label htmlFor="message" className="text-foreground">Message</Label>
            <Textarea
              id="message"
              className="mt-1.5"
              rows={5}
              placeholder="Tell us what you're working on…"
            />
          </div>
          <Button type="button" className="w-full">Send message</Button>
        </form>
      </div>
    </div>
  );
}

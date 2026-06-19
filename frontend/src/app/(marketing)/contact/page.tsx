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
          <form className="space-y-5">
            <div>
              <Label htmlFor="name" className="text-foreground">
                Name
              </Label>
              <Input id="name" className="mt-1.5" placeholder="Your name" />
            </div>
            <div>
              <Label htmlFor="email" className="text-foreground">
                Email
              </Label>
              <Input id="email" type="email" className="mt-1.5" placeholder="you@company.com" />
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
              />
            </div>
            <Button type="button" className="w-full">
              Send message
            </Button>
          </form>
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}

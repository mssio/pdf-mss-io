import { Link, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    text: <>In Safari, tap the menu button at the left of the address bar.</>,
    note: "On older iPhones the Share button is at the bottom of the screen.",
    image: "/install/ios-1-menu.webp",
    alt: "Safari showing PDF Toolbox at pdf.mss.io, with the menu button at the left of the address bar circled.",
  },
  {
    text: <>Tap <strong>Share</strong>.</>,
    image: "/install/ios-2-share.webp",
    alt: "Safari's menu open over the page, with Share circled.",
  },
  {
    text: <>Scroll down and tap <strong>Add to Home Screen</strong>.</>,
    image: "/install/ios-3-add-to-home-screen.webp",
    alt: "The share sheet scrolled down, with Add to Home Screen circled at the bottom.",
  },
  {
    text: <>Keep <strong>Open as Web App</strong> on and tap <strong>Add</strong>.</>,
    image: "/install/ios-4-add.webp",
    alt: "The Add to Home Screen screen for PDF Toolbox at pdf.mss.io, with the Add button circled.",
  },
  {
    text: (
      <>
        Open <strong>PDF Toolbox</strong> from your Home Screen. Keep it open while online until the footer says{" "}
        <strong>Ready offline</strong>.
      </>
    ),
    image: "/install/ios-5-home-screen.webp",
    alt: "The Home Screen with the PDF Toolbox icon circled.",
  },
];

/** /install/:step — how to add the app to an iPhone's Home Screen, one step per page. */
export function Component() {
  const { step } = useParams();
  const parsed = Number(step);
  const number = Number.isInteger(parsed) && parsed >= 1 && parsed <= STEPS.length ? parsed : 1;
  const current = STEPS[number - 1];
  const last = number === STEPS.length;

  return (
    <div className="mx-auto max-w-lg px-4 py-4 sm:px-6 sm:py-10">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Add PDF Toolbox to your Home Screen</h1>
          </CardTitle>
          <CardDescription>
            Step {number} of {STEPS.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm">{current.text}</p>
          {current.note ? <p className="text-xs text-muted-foreground">{current.note}</p> : null}
          {/* A phone-shaped frame so the screenshot reads as a whole iPhone screen. */}
          <div className="mx-auto w-fit rounded-[2.25rem] border-4 border-foreground bg-foreground p-1 shadow-md">
            <img
              src={current.image}
              alt={current.alt}
              width={600}
              height={1304}
              className="block h-auto max-h-[50svh] w-auto rounded-[1.9rem]"
            />
          </div>
          <ol aria-label="Steps" className="flex justify-center gap-2">
            {STEPS.map((_, index) => (
              <li key={index}>
                <Link
                  to={`/install/${index + 1}`}
                  aria-label={`Step ${index + 1}`}
                  aria-current={index + 1 === number ? "step" : undefined}
                  className={cn(
                    "block size-2.5 rounded-full bg-muted-foreground/30",
                    index + 1 === number && "bg-foreground",
                  )}
                />
              </li>
            ))}
          </ol>
          <div className="flex justify-between gap-2">
            {number > 1 ? (
              <Button variant="outline" asChild>
                <Link to={`/install/${number - 1}`}>Back</Link>
              </Button>
            ) : (
              <span />
            )}
            <Button asChild>
              <Link to={last ? "/" : `/install/${number + 1}`}>{last ? "Done" : "Next"}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

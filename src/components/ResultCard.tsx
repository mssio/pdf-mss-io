import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ResultCardProps = {
  title: string;
  description: ReactNode;
  download?: { url: string; filename: string; label: string };
  anotherLabel: string;
  onAnother: () => void;
  children?: ReactNode;
};

export function ResultCard({ title, description, download, anotherLabel, onAnother, children }: ResultCardProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <Card>
        <CardHeader>
          <CardTitle className="break-words">{title}</CardTitle>
          <CardDescription className="break-words">{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {children}
          {download ? (
            <Button className="w-full" asChild>
              <a href={download.url} download={download.filename}>
                <Download className="size-4" />
                {download.label}
              </a>
            </Button>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button variant="outline" className="w-full sm:flex-1" asChild>
              <Link to="/">Back to home</Link>
            </Button>
            <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={onAnother}>
              {anotherLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

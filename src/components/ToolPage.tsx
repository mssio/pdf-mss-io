import type { ReactNode } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ToolPageProps = {
  title: string;
  intro: ReactNode;
  cardTitle: string;
  cardDescription?: ReactNode;
  children: ReactNode;
};

export function ToolPage({ title, intro, cardTitle, cardDescription, children }: ToolPageProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{intro}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
          {cardDescription ? (
            <CardDescription className="flex items-start gap-2 pt-1">{cardDescription}</CardDescription>
          ) : null}
        </CardHeader>
        {children}
      </Card>
    </div>
  );
}

// src/components/ClientPortal/PortalMigrationPending.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Wrench } from "lucide-react";

interface PortalMigrationPendingProps {
  featureName: string;
}

export default function PortalMigrationPending({ featureName }: PortalMigrationPendingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light p-6">
      <div className="max-w-2xl mx-auto">
        <Card className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm">
          <CardContent className="text-center py-16">
            <Wrench className="h-12 w-12 text-neon-purple mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">{featureName} is being upgraded</h2>
            <p className="text-gray-300">
              We're moving this feature to our new infrastructure. It will be back shortly — thanks for your
              patience in the meantime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

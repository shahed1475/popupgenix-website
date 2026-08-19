import { useEffect, useState } from "react";
import { getCurrentUser, type AdminUser } from "@/lib/api/auth";
import { listProjects, type Project } from "@/lib/api/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calendar, CheckCircle, Clock, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getUser();
    getUserProject();
  }, []);

  const getUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error fetching user:', error);
      toast({
        title: "Error",
        description: "Failed to load user information",
        variant: "destructive"
      });
    }
  };

  const getUserProject = async () => {
    try {
      const projects = await listProjects();
      if (projects.length > 0) {
        setProject(projects[0]);
      }
    } catch (error) {
      console.error('Error fetching project:', error);
      toast({
        title: "Error",
        description: "Failed to load project information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-purple"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Welcome Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent">
            Welcome {user?.full_name ?? user?.email} 👋
          </h1>
          <p className="text-gray-300 text-lg">Your project dashboard and updates</p>
        </div>

        {project ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Project Overview */}
            <Card className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <CheckCircle className="h-5 w-5 text-neon-purple" />
                  Project Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {project.title}
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Progress</span>
                      <span className="text-neon-blue font-medium">{project.completion_percentage}% Completed</span>
                    </div>
                    <Progress value={project.completion_percentage} className="h-3" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Next Milestone */}
            <Card className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Clock className="h-5 w-5 text-neon-blue" />
                  Next Milestone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">
                    {project.next_milestone}
                  </h3>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Calendar className="h-4 w-4" />
                    <span>ETA: {new Date(project.eta_date).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm">
            <CardContent className="text-center py-12">
              <UserIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Active Project</h3>
              <p className="text-gray-300">
                You don't have any active projects yet. Contact us to get started!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-neon-purple/10 to-neon-blue/10 border-neon-purple/20">
            <CardContent className="text-center py-6">
              <div className="text-3xl font-bold text-neon-purple mb-2">
                {project?.completion_percentage || 0}%
              </div>
              <div className="text-gray-300">Project Progress</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-neon-blue/10 to-neon-purple/10 border-neon-blue/20">
            <CardContent className="text-center py-6">
              <div className="text-3xl font-bold text-neon-blue mb-2">
                {project ? 1 : 0}
              </div>
              <div className="text-gray-300">Active Projects</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/20">
            <CardContent className="text-center py-6">
              <div className="text-3xl font-bold text-purple-400 mb-2">
                5+
              </div>
              <div className="text-gray-300">Years Experience</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
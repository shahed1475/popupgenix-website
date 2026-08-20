import { useState, useEffect } from "react";
import { getCurrentUser } from "@/lib/api/auth";
import { listMyFeedback, submitFeedback as submitFeedbackApi, type Feedback } from "@/lib/api/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, CheckCircle, Clock, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [newFeedback, setNewFeedback] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getFeedbacks();
  }, []);

  const getFeedbacks = async () => {
    setLoading(true);
    try {
      const feedbackData = await listMyFeedback();
      setFeedbacks(feedbackData);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast({
        title: "Error",
        description: "Failed to load feedback history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!newFeedback.trim()) {
      toast({
        title: "Error",
        description: "Please enter your feedback",
        variant: "destructive"
      });
      return;
    }

    setSubmitting(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      await submitFeedbackApi({
        client_name: user.full_name || user.email,
        client_email: user.email,
        rating,
        testimonial: newFeedback,
      });

      toast({
        title: "Success",
        description: "Your feedback has been submitted for review!",
      });

      setNewFeedback("");
      setRating(5);
      getFeedbacks(); // Refresh the list
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'rejected':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const renderStars = (rating: number, interactive = false, onRatingChange?: (rating: number) => void) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-5 w-5 ${
              star <= rating
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-400'
            } ${interactive ? 'cursor-pointer hover:text-yellow-300' : ''}`}
            onClick={interactive && onRatingChange ? () => onRatingChange(star) : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-midnight-dark via-midnight to-midnight-light p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-neon-purple to-neon-blue bg-clip-text text-transparent">
            Feedback & Reviews
          </h1>
          <p className="text-gray-300 text-lg">Share your experience and help us improve</p>
        </div>

        {/* Submit New Feedback */}
        <Card className="bg-midnight-light/50 border-gray-700 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <MessageSquare className="h-5 w-5 text-neon-purple" />
              Leave Your Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Rate Our Service
              </label>
              {renderStars(rating, true, setRating)}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-2">
                Your Feedback
              </label>
              <Textarea
                value={newFeedback}
                onChange={(e) => setNewFeedback(e.target.value)}
                placeholder="Tell us about your experience with our service..."
                className="bg-background text-foreground placeholder:text-muted-foreground border-border min-h-[120px]"
              />
            </div>

            <Button
              onClick={handleSubmitFeedback}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-neon-purple to-neon-blue hover:from-neon-purple/80 hover:to-neon-blue/80"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Submitting...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Submit Feedback
                </div>
              )}
            </Button>

            <div className="text-sm text-gray-400 bg-midnight/30 p-3 rounded-lg">
              <strong>Note:</strong> Approved feedback may be featured on our homepage to help other potential clients.
            </div>
          </CardContent>
        </Card>

        {/* Feedback History */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-white">Your Feedback History</h2>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neon-purple"></div>
            </div>
          ) : feedbacks.length > 0 ? (
            <div className="space-y-4">
              {feedbacks.map((feedback) => (
                <Card key={feedback.id} className="bg-midnight-light/30 border-gray-700">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {renderStars(feedback.rating)}
                        <Badge className={getStatusColor(feedback.status)}>
                          {getStatusIcon(feedback.status)}
                          <span className="ml-1 capitalize">{feedback.status}</span>
                        </Badge>
                      </div>
                      <span className="text-sm text-gray-400">
                        {new Date(feedback.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <p className="text-gray-300 leading-relaxed">{feedback.testimonial}</p>
                    
                    {feedback.status === 'approved' && (
                      <div className="mt-3 text-sm text-green-400 bg-green-500/10 p-2 rounded">
                        ✓ This feedback is featured on our homepage
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-midnight-light/30 border-gray-700">
              <CardContent className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No Feedback Yet</h3>
                <p className="text-gray-300">
                  Share your experience with our service using the form above.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  phone?: string;
  company?: string;
  subject?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Received notification request");
    
    const payload: ContactMessage = await req.json();
    console.log("Processing message from:", payload.name);

    // Send email notification to admin
    const emailResponse = await resend.emails.send({
      from: "PopupGenix Notifications <onboarding@resend.dev>",
      to: ["popupitcompany@gmail.com"],
      subject: "New Client Message on PopupGenix",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8B5CF6;">New Client Message Received</h2>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Client Details:</h3>
            <p><strong>Name:</strong> ${payload.name}</p>
            <p><strong>Email:</strong> <a href="mailto:${payload.email}">${payload.email}</a></p>
            ${payload.phone ? `<p><strong>Phone:</strong> ${payload.phone}</p>` : ''}
            ${payload.company ? `<p><strong>Company:</strong> ${payload.company}</p>` : ''}
            ${payload.subject ? `<p><strong>Subject:</strong> ${payload.subject}</p>` : ''}
          </div>

          <div style="background: #fff; padding: 20px; border-left: 4px solid #8B5CF6; margin: 20px 0;">
            <h3 style="margin-top: 0;">Message Preview:</h3>
            <p style="white-space: pre-wrap;">${payload.message.substring(0, 200)}${payload.message.length > 200 ? '...' : ''}</p>
          </div>

          <div style="margin: 30px 0;">
            <a href="https://popupgenix.com/admin/messages" 
               style="display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View in Admin Dashboard
            </a>
          </div>

          <p style="color: #666; font-size: 12px;">
            This is an automated notification from PopupGenix. 
            Log in to your admin dashboard to view the full message and respond.
          </p>
        </div>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-new-message function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

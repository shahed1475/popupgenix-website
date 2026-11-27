import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  updateId: string;
  clientEmail: string;
  clientName: string;
  title: string;
  content: string;
  hasFile: boolean;
  hasLink: boolean;
  linkUrl?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { updateId, clientEmail, clientName, title, content, hasFile, hasLink, linkUrl }: NotificationRequest = await req.json();

    console.log("Sending client update notification:", { clientEmail, title });

    let fileSection = "";
    if (hasFile) {
      fileSection = `
        <p style="margin: 20px 0;">
          📎 <strong>Attachment:</strong> A file has been attached to this update. Please log in to your dashboard to download it.
        </p>
      `;
    }

    let linkSection = "";
    if (hasLink && linkUrl) {
      linkSection = `
        <p style="margin: 20px 0;">
          🔗 <strong>Related Link:</strong> <a href="${linkUrl}" style="color: #8B5CF6; text-decoration: underline;">${linkUrl}</a>
        </p>
      `;
    }

    const emailResponse = await resend.emails.send({
      from: "PopupGenix <updates@popupgenix.com>",
      to: [clientEmail],
      subject: `Project Update: ${title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%);
              color: white;
              padding: 30px;
              border-radius: 10px 10px 0 0;
              text-align: center;
            }
            .content {
              background: #ffffff;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .footer {
              background: #f9fafb;
              padding: 20px;
              text-align: center;
              border: 1px solid #e5e7eb;
              border-top: none;
              border-radius: 0 0 10px 10px;
              font-size: 14px;
              color: #6b7280;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%);
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">📢 New Project Update</h1>
          </div>
          <div class="content">
            <p>Hello ${clientName},</p>
            <p>You have received a new update regarding your project:</p>
            
            <h2 style="color: #8B5CF6; margin-top: 30px;">${title}</h2>
            <div style="background: #f9fafb; padding: 20px; border-left: 4px solid #8B5CF6; margin: 20px 0;">
              ${content.replace(/\n/g, '<br>')}
            </div>

            ${fileSection}
            ${linkSection}

            <div style="text-align: center; margin-top: 30px;">
              <a href="https://popupgenix.com/portal" class="button">
                View in Dashboard
              </a>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated notification from PopupGenix.</p>
            <p>© ${new Date().getFullYear()} PopupGenix. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-client-update function:", error);
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

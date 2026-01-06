import React, { useEffect, useState } from 'react';
import { BookOpen, AlertCircle, ShieldCheck } from 'lucide-react';

// --- CONFIGURATION ---
// PASTE YOUR GOOGLE CLIENT ID HERE
const GOOGLE_CLIENT_ID = "167463324417-i3vmm8ucu3dji61tt3611ipcc9hak86d.apps.googleusercontent.com"; 

interface LoginProps {
  onLogin: (email: string, name: string) => boolean;
}

declare global {
  interface Window {
    google: any;
  }
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [error, setError] = useState<string | null>(null);

  // Helper to decode JWT without external libraries
  const decodeJwtResponse = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error("Failed to decode JWT", e);
      return null;
    }
  };

  const handleCredentialResponse = (response: any) => {
    const responsePayload = decodeJwtResponse(response.credential);

    if (responsePayload) {
      const email = responsePayload.email;
      const name = responsePayload.name;
      
      const success = onLogin(email, name);
      if (!success) {
        setError(`Access Denied: The account ${email} is not authorized.`);
      }
    } else {
      setError("Failed to verify Google account.");
    }
  };

  useEffect(() => {
    // Check if script is loaded
    if (window.google && window.google.accounts) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(
        document.getElementById("googleSignInDiv"),
        { theme: "outline", size: "large", width: "300" } 
      );
    } else {
      setError("Google Sign-In script not loaded. Please refresh.");
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="bg-indigo-600 p-3 rounded-xl w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
          <BookOpen className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          BookMind AI
        </h1>
        <p className="text-gray-500 mt-2">Intelligent PDF Analysis</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="p-8 md:p-10 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-8 text-gray-900 font-semibold text-lg">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            Login Wall Access
          </div>

          <p className="text-gray-500 text-center mb-6 text-sm">
            This application is private. Please sign in with your authorized Google account to continue.
          </p>

          <div id="googleSignInDiv" className="w-full flex justify-center min-h-[50px]"></div>

          {error && (
            <div className="mt-6 flex items-start gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg w-full animate-in fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} BookMind AI. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};
"use client";

import { useState, useMemo, useEffect } from "react";

import { UserButton, Show, SignInButton, useUser } from "@clerk/nextjs";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Time formatting helper (Converts "17:30" to "5:30 PM")
const formatTime = (time24: string) => {
  if (!time24) return "";
  const [hourStr, minute] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour}:${minute} ${ampm}`;
};

export default function Home() {
  // Point to the cloud backend in production, but use local if running on your machine
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const [schedule, setSchedule] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  // Chat States
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: "ai", content: "Hello! I am your AI Scheduling Assistant. You can ask me to generate a schedule, or tell me if an employee needs time off." }
  ]);

  // Clerk User Hook
  const { isLoaded, isSignedIn, user } = useUser();
  const [managerId, setManagerId] = useState<number | null>(null);

  // Dynamically update the AI greeting based on login status
  useEffect(() => {
    // Only update the greeting if the user hasn't started chatting yet
    if (isLoaded && messages.length <= 1) {
      if (isSignedIn) {
        setMessages([
          { role: "ai", content: "Hello! I am your AI Scheduling Assistant. You can ask me to generate a schedule, or tell me if an employee needs time off." }
        ]);
      } else {
        setMessages([
          { role: "ai", content: "Welcome! I am your AI Scheduling Assistant. Please click 'Manager Login' at the top of the screen to connect your branches and get started." }
        ]);
      }
    }
  }, [isLoaded, isSignedIn]);

  // Branch States
  const [branches, setBranches] = useState<any[]>([]);
  const [newBranchName, setNewBranchName] = useState("");
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);

  // Roster States
  const [activeBranch, setActiveBranch] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [newEmpName, setNewEmpName] = useState("");
  const [isFullTime, setIsFullTime] = useState(true);
  const [isHiring, setIsHiring] = useState(false);
  const [newEmpSkills, setNewEmpSkills] = useState<string[]>([]);

  // Editing States
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<{name: string, is_full_time: boolean, min_hours: number, max_hours: number, skills: string[]}>({ name: "", is_full_time: true, min_hours: 0, max_hours: 0, skills: [] });
  
  // Branch Settings States
  const [showSettings, setShowSettings] = useState(false);
  const [branchHeadcount, setBranchHeadcount] = useState(5);

  // AI Rules State
  const [customRules, setCustomRules] = useState<any[]>([]);

  // --- Cold Start UI States ---
  const [showBanner, setShowBanner] = useState(true);
  const [showColdStartInfo, setShowColdStartInfo] = useState(false);

  // Welcome Modal State
  const [showWelcome, setShowWelcome] = useState(false);

  // Trigger the modal once per session when the page loads
  useEffect(() => {
    const hasSeenModal = sessionStorage.getItem("hasSeenWelcome");
    if (!hasSeenModal) {
      setShowWelcome(true);
      sessionStorage.setItem("hasSeenWelcome", "true");
    }
  }, []);
  
  const availableSkills = ["Combo A", "Combo B", "Vault", "ATM"];
  const toggleSkill = (skill: string, currentSkills: string[], setSkillsFn: (s: string[]) => void) => {
    if (currentSkills.includes(skill)) {
      setSkillsFn(currentSkills.filter(s => s !== skill));
    } else {
      setSkillsFn([...currentSkills, skill]);
    }
  };

  // Sync with the Python backend whenever the user logs in
  useEffect(() => {
    if (isSignedIn && user) {
      const syncManager = async () => {
        try {
          const response = await fetch(`${API_URL}/api/managers/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clerk_id: user.id,
              email: user.primaryEmailAddress?.emailAddress,
            }),
          });
          
          if (response.ok) {
            const data = await response.json();
            setManagerId(data.manager_id);
            console.log("Successfully synced manager. DB ID:", data.manager_id);
            
            // Fetch their branches immediately!
            const branchRes = await fetch(`${API_URL}/api/branches/${data.manager_id}`);
            if (branchRes.ok) {
              const branchData = await branchRes.json();
              setBranches(branchData.branches);
              
              if (branchData.branches.length > 0) {
                // THE FIX: Only default to the first branch if we haven't selected one yet!
                setActiveBranch((currentActive: any) => 
                  currentActive ? currentActive : branchData.branches[0]
                );
              }
            }
          }
        } catch (error) {
          console.error("Failed to sync manager with backend.");
        }
      };
      
      syncManager();
    }
  }, [isSignedIn, user]);

  // Fetch Roster when active branch changes
  useEffect(() => {
    if (activeBranch) {
      const fetchRoster = async () => {
        const res = await fetch(`${API_URL}/api/branches/${activeBranch.id}/employees`);
        if (res.ok) {
          const data = await res.json();
          setRoster(data.employees);
        }
      };
      fetchRoster();
    }
  }, [activeBranch]);

  // Fetch the live employee rules from the database
  const fetchEmployees = async () => {
    try {
      const response = await fetch(`${API_URL}/api/employees`);
      if (response.ok) {
        const data = await response.json();
        setEmployees(data.employees);
      }
    } catch (err) {
      console.error("Could not load employee data.");
    }
  };

  // Fetch Custom Rules when the branch changes
  const fetchRules = async () => {
    if (!activeBranch) return;
    try {
      const res = await fetch(`${API_URL}/api/branches/${activeBranch.id}/rules`);
      if (res.ok) {
        const data = await res.json();
        setCustomRules(data.rules);
      }
    } catch (err) {
      console.error("Failed to load custom rules.");
    }
  };

  useEffect(() => {
    if (activeBranch) {
      fetchRules();
    }
  }, [activeBranch]);

  // Run once when the page loads
  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchSchedule = async () => {
    if (!activeBranch) {
      setError("Please select a branch first.");
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccessMsg(""); // Clear previous success messages
    
    try {
      const response = await fetch(`${API_URL}/api/branches/${activeBranch.id}/schedule`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to generate schedule.");
      }
      
      const data = await response.json();
      
      // NEW FIX: Did the math engine specifically return an infeasible error?
      if (data.schedule && data.schedule.status === "error") {
        throw new Error(`Math Engine Failed: ${data.schedule.message} Check your employee constraints and try again.`);
      }
      
      let actualData = data.schedule;
      if (actualData && actualData.schedule && !Array.isArray(actualData.schedule)) {
        actualData = actualData.schedule;
      }

      const sortedSchedule: any = {};
      
      if (Array.isArray(actualData)) {
        actualData.forEach((shift: any) => {
          const dayName = shift.day_of_week || shift.day || shift.date || "Scheduled Shifts";
          if (!sortedSchedule[dayName]) sortedSchedule[dayName] = [];
          sortedSchedule[dayName].push(shift);
        });
      } 
      else if (typeof actualData === 'object' && actualData !== null) {
        Object.keys(actualData).forEach(key => {
          if (Array.isArray(actualData[key])) {
            sortedSchedule[key] = [...actualData[key]];
          }
        });
      }

      Object.keys(sortedSchedule).forEach(day => {
        sortedSchedule[day].sort((a: any, b: any) => {
          const locA = a.location || a.home_location || "";
          const locB = b.location || b.home_location || "";
          const timeA = a.start_time || "";
          const timeB = b.start_time || "";
          
          const locationCompare = locA.localeCompare(locB);
          if (locationCompare !== 0) return locationCompare;
          return timeA.localeCompare(timeB);
        });
      });
      
      setSchedule(sortedSchedule);
      setSuccessMsg(`Successfully generated optimal schedule for ${activeBranch.name}!`); // SUCCESS TRIGGER!
      
    } catch (err: any) {
      setError(err.message);
      setSchedule(null); // Clear the old schedule if the new one fails
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    // THE FIX: Ensure they have selected a branch before chatting!
    if (!activeBranch) {
      setMessages(prev => [...prev, { role: "ai", content: "Please select a branch first so I know who we are scheduling!" }]);
      return;
    }

    const userText = chatInput;
    setMessages(prev => [...prev, { role: "user", content: userText }]);
    setChatInput("");
    setIsTyping(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userText,
          branch_id: activeBranch.id // THE FIX: Tell the AI which branch we are looking at!
        })
      });
      
      const data = await response.json();
      setMessages(prev => [...prev, { role: "ai", content: data.reply }]);
      
      // Refresh the rules dashboard
      fetchRules();

      if (data.reply.toLowerCase().includes("generated") || data.reply.toLowerCase().includes("schedule")) {
        fetchSchedule();
      }
      
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", content: "Sorry, I couldn't reach the backend server." }]);
    } finally {
      setIsTyping(false);
    }
  };

  // UPGRADED: Export Schedule to Formatted PDF
  const exportScheduleToPDF = () => {
    if (!schedule || Object.keys(schedule).length === 0) {
      alert("No schedule available to export. Please generate one first!");
      return;
    }

    const doc = new jsPDF();
    const branchName = activeBranch?.name || "Branch";
    
    // --- MAIN HEADER ---
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138); 
    doc.text(`${branchName} - Weekly Schedule`, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Generated by AI Optimization Engine, for you.", 14, 28);

    const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    // We will track the vertical position so we know where to draw the next day's table
    let currentY = 40; 

    // --- DRAW A SEPARATE TABLE FOR EACH DAY ---
    daysOrder.forEach(day => {
      if (schedule[day] && schedule[day].length > 0) {
        
        // Safety check: If we are too close to the bottom of the page, add a new page!
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        // 1. Draw the Day Sub-Header
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42); // Dark slate
        doc.setFont("helvetica", "bold");
        doc.text(day, 14, currentY);
        currentY += 6; // Add a little space between the text and the table

        // 2. Build the data specifically for this day (and REMOVE the emoji!)
        const dayData = schedule[day].map((shift: any) => [
          shift.employee_name,
          `${formatTime(shift.start_time)} - ${formatTime(shift.end_time)}`,
          `${shift.paid_hours} hrs`,
          shift.is_opening ? "Yes" : "-" 
        ]);

        // 3. Draw the Mini-Table
        autoTable(doc, {
          startY: currentY,
          head: [["Employee", "Shift Time", "Paid Hours", "Opener"]],
          body: dayData,
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229], fontStyle: 'bold' }, // Indigo-600
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { fontSize: 10, cellPadding: 4 },
          columnStyles: {
            0: { fontStyle: 'bold', textColor: [51, 65, 85] } // Bold employee names
          },
          margin: { left: 14, right: 14 }
        });

        // 4. Push the Y coordinate down for the next day! 
        // (We grab the final Y position of the table we just drew and add a 15px gap)
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }
    });

    // --- TRIGGER DOWNLOAD ---
    doc.save(`${branchName}_Weekly_Schedule.pdf`);
  };

  const employeeTotals = useMemo(() => {
    if (!schedule) return null;
    const totals: Record<string, number> = {};
    
    Object.keys(schedule).forEach((day) => {
      schedule[day].forEach((shift: any) => {
        totals[shift.employee_name] = (totals[shift.employee_name] || 0) + shift.paid_hours;
      });
    });
    
    return Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0]));
  }, [schedule]);

  return (
    <main className="min-h-screen bg-gray-50 p-8 text-slate-800">
      {/* --- MOBILE BLOCKER (Only visible on small screens) --- */}
      <div className="md:hidden fixed inset-0 z-100 flex flex-col items-center justify-center bg-slate-900 text-white p-8 text-center">
        <span className="text-5xl mb-6">🖥️</span>
        <h2 className="text-2xl font-bold mb-3 tracking-wide">Desktop Required</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          This AI scheduling engine is built for complex operational tasks and is optimized for larger screens. 
          <br /><br />
          Please visit this site on a desktop or laptop computer for the full experience.
        </p>
      </div>

      <div className="hidden md:block p-8">
        {/* --- COLD START BANNER --- */}
        {showBanner && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex items-center justify-between shadow-sm transition-all">
            <div className="flex items-center gap-3">
              <span className="text-xl">⏳</span>
              <p className="text-sm font-medium text-amber-800">
                Notice: If your branches or employees do not load immediately, the cloud backend is currently waking up. Please wait 60 seconds and refresh.
                <button 
                  onClick={() => setShowColdStartInfo(true)}
                  className="ml-2 underline text-amber-600 hover:text-amber-900 font-bold transition-colors"
                >
                  Why does this happen?
                </button>
              </p>
            </div>
            <button 
              onClick={() => setShowBanner(false)}
              className="text-amber-500 hover:text-amber-700 font-bold text-lg px-2"
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        )}

        {/* --- COLD START EXPLANATION MODAL --- */}
        {showColdStartInfo && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
              <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
                  <span>☁️</span> Note on Cloud Architecture
                </h2>
                <button 
                  onClick={() => setShowColdStartInfo(false)}
                  className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
                >
                  &times;
                </button>
              </div>
              <div className="p-6 text-slate-700 space-y-4 text-sm leading-relaxed">
                <p>
                  To keep this portfolio project resource-efficient, the Python backend is hosted on a scaled-to-zero cloud container (via Render). 
                </p>
                <p>
                  <strong>What does this mean?</strong><br/>
                  If the application receives no API traffic for 15 minutes, the server automatically spins down to conserve compute resources. When a new user logs in, the server experiences a <strong>"Cold Start"</strong>—it takes about 50 to 60 seconds for the container to provision, boot up the FastAPI server, and re-establish the PostgreSQL database connection.
                </p>
                <p>
                  In a true enterprise production environment, this service would be provisioned on a dedicated, always-on instance. Thank you for your patience as the server wakes up!
                </p>
              </div>
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end">
                <button 
                  onClick={() => setShowColdStartInfo(false)}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-medium py-2 px-6 rounded-lg text-sm shadow-sm transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
        {/* --- WELCOME & ABOUT ME MODAL (PROFESSIONAL VERSION) --- */}
        {showWelcome && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-gray-100 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
              
              {/* Header - Sleek Dark Slate, No Emoji */}
              <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white tracking-wide">
                  Welcome to Capital One's AI Scheduler
                </h2>
                <button 
                  onClick={() => setShowWelcome(false)}
                  className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
              
              {/* Body */}
              <div className="p-8 text-slate-700 space-y-6">
                
                {/* Profile Section: Headshot + Bio */}
                <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                  
                  {/* Headshot Placeholder */}
                  <div className="shrink-0">
                    <div className="w-28 h-28 rounded-full bg-slate-100 border-4 border-white shadow-md overflow-hidden flex items-center justify-center relative group">
                      <img src="/headshot2025.jpg" alt="Adrian Rodriguez" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  {/* Bio Text */}
                  <div className="space-y-3 text-center sm:text-left flex-1">
                    <p className="font-semibold text-2xl text-slate-900">
                      Hi, I'm Adrian Rodriguez.
                    </p>
                    <p className="text-sm leading-relaxed text-slate-600">
                      I love solving real-world problems using software and AI. I built this scheduling engine to eliminate a complex operational bottleneck using mathematically optimized constraints and deterministic solvers.
                    </p>
                    <p className="text-sm leading-relaxed text-slate-600">
                      I hold a BS in Computer Science from Rensselaer Polytechnic Institute and am currently pursuing my MS in Cybersecurity and Information Assurance at WGU. I am actively seeking roles as a Cyber Security Analyst or in Software Engineering.
                    </p>
                    <div className="bg-indigo-50 border-l-4 border-indigo-500 p-3 rounded-r-lg mt-2">
                      <p className="text-sm font-medium text-indigo-900">
                        Have a complex workflow or operational headache? 
                      </p>
                      <p className="text-xs text-indigo-700 mt-1">
                        I am always looking for new architectural challenges. Feel free to use the email link below to pitch me an idea or problem you'd like to see solved!
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Highlight Box - Clean Professional Badges */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">My Focus Areas</h3>
                  <div className="flex flex-wrap gap-2.5">
                    <span className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded shadow-sm">Software Development</span>
                    <span className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded shadow-sm">Security Operations (SOC)</span>
                    <span className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded shadow-sm">Incident Response</span>
                    <span className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded shadow-sm">CompTIA CySA+ / ISC² CC</span>
                  </div>
                </div>
              </div>

              {/* Footer / Call to Action */}
              <div className="bg-slate-100 border-t border-slate-200 px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex gap-3 w-full sm:w-auto">
                  <a href="mailto:arodr223@outlook.com" className="flex-1 sm:flex-none text-center bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2 px-5 rounded-lg text-sm shadow-sm transition-colors">
                    Email Me
                  </a>
                  <a href="https://www.linkedin.com/in/rpiarodriguez/" target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none text-center bg-[#0A66C2] hover:bg-[#004182] text-white font-medium py-2 px-5 rounded-lg text-sm shadow-sm transition-colors">
                    LinkedIn
                  </a>
                </div>
                <button 
                  onClick={() => setShowWelcome(false)}
                  className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white font-medium py-2 px-8 rounded-lg text-sm shadow-sm transition-colors"
                >
                  Explore the App &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
        {/* -------------------------------- */}

        <div className="max-w-7xl mx-auto flex gap-8">
          
          {/* LEFT COLUMN: Schedule View */}
          <div className="flex-1">
            {/* --- MAIN HEADER (Back to normal, no sticky!) --- */}
            <header className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-3xl font-bold text-blue-900">Branch Schedule Manager</h1>
                <p className="text-gray-500 mt-1">AI-Powered Optimization Engine</p>
              </div>
              
              <div className="flex items-center gap-4">
                {/* Clerk Login/Profile (Kept cleanly at the top) */}
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md transition-all">
                      Manager Login
                    </button>
                  </SignInButton>
                </Show>
                
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
            </header>

            {/* --- THE DETACHED FLOATING PILL --- */}
            <Show when="signed-in">
              {/* The wrapper has pointer-events-none so it doesn't block you from clicking things underneath it! */}
              <div className="sticky top-6 z-40 flex justify-end mb-6 pointer-events-none">
                
                {/* The glassmorphism pill (pointer-events-auto restores clicking for the buttons) */}
                <div className="flex gap-3 bg-white/80 backdrop-blur-md p-2 rounded-2xl shadow-lg border border-slate-200 pointer-events-auto transition-all">
                  
                  <button
                    onClick={exportScheduleToPDF}
                    disabled={!schedule || Object.keys(schedule).length === 0}
                    className="bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-semibold py-2 px-4 rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    <span>📄</span> Export to PDF
                  </button>

                  <button 
                    onClick={fetchSchedule}
                    disabled={loading || !activeBranch}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-xl shadow-sm transition-colors disabled:bg-gray-400 flex items-center gap-2 text-sm"
                  >
                    {loading ? <span className="animate-spin text-lg">⏳</span> : <span>✨</span>}
                    {loading ? "Generating..." : "Generate Schedule"}
                  </button>
                  
                </div>
              </div>
            </Show>

            {/* ---------------------------------------------------------------- */}
            {/* SECTION 1: BRANCH MANAGEMENT (Only visible if logged in)           */}
            {/* ---------------------------------------------------------------- */}
            {managerId && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8 p-6">
                <h2 className="text-xl font-bold text-slate-700 mb-4">Your Branches</h2>
                
                {branches.length > 0 ? (
                  <div className="flex gap-4">
                    {branches.map((branch, i) => (
                      <div key={i} className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg font-semibold shadow-sm cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => setActiveBranch(branch)}>
                        🏦 {branch.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 mb-4">You don't have any branches set up yet.</div>
                )}

                {/* Form to create a new branch */}
                <div className="mt-6 flex gap-3">
                  <input 
                    type="text" 
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="e.g. Paramus Branch" 
                    className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button 
                    onClick={async () => {
                      if (!newBranchName.trim()) return;
                      setIsCreatingBranch(true);
                      const res = await fetch(`${API_URL}/api/branches`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newBranchName, manager_id: managerId })
                      });
                      if (res.ok) {
                        const newBranch = await res.json();
                        setBranches([...branches, newBranch]);
                        setNewBranchName("");
                      }
                      setIsCreatingBranch(false);
                    }}
                    disabled={isCreatingBranch || !newBranchName.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md disabled:bg-gray-400"
                  >
                    {isCreatingBranch ? "Creating..." : "Create Branch"}
                  </button>
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* SECTION 2: ACTIVE BRANCH ROSTER (Only visible if a branch is selected) */}
            {/* ---------------------------------------------------------------- */}
            {activeBranch && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8 p-6">
                {/* --- UPGRADED BRANCH HEADER & SETTINGS --- */}
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-slate-700">
                    {activeBranch.name} Roster
                  </h2>
                  <button 
                    onClick={() => {
                      // Load the current setting from the branch, defaulting to 5 if undefined
                      setBranchHeadcount(activeBranch.min_daily_headcount || 5);
                      setShowSettings(!showSettings);
                    }}
                    className="text-gray-600 hover:text-gray-900 flex items-center gap-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors shadow-sm border border-gray-200"
                  >
                    ⚙️ Branch Settings
                  </button>
                </div>

                {/* SETTINGS PANEL (Only visible when toggled) */}
                {showSettings && (
                  <div className="mb-6 bg-slate-100 p-4 rounded-lg border border-slate-200 shadow-inner flex items-end gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        Minimum Daily Employees
                      </label>
                      <input 
                        type="number" 
                        min="1" 
                        max="20"
                        title="Minimum daily employees required"
                        placeholder="e.g. 5"
                        value={branchHeadcount}
                        onChange={(e) => setBranchHeadcount(parseInt(e.target.value) || 1)}
                        className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        const res = await fetch(`${API_URL}/api/branches/${activeBranch.id}/settings`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ min_daily_headcount: branchHeadcount })
                        });
                        if (res.ok) {
                          const updatedBranch = await res.json();
                          setActiveBranch(updatedBranch); // Update active branch state
                          
                          // Update the branch in the main branches array so it persists if they click around
                          setBranches(branches.map(b => b.id === updatedBranch.id ? updatedBranch : b));
                          setShowSettings(false); // Close the panel
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-5 rounded-lg shadow-sm text-sm transition-colors"
                    >
                      Save Changes
                    </button>
                    <button 
                      onClick={() => setShowSettings(false)}
                      className="text-slate-500 hover:text-slate-700 text-sm font-medium px-2 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {/* ----------------------------------------- */}
                
                {/* Hiring Form */}
                <div className="flex flex-col gap-3 mb-6 bg-slate-50 p-4 rounded-lg border border-gray-100">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Employee Name</label>
                      <input 
                        type="text" 
                        value={newEmpName}
                        onChange={(e) => setNewEmpName(e.target.value)}
                        placeholder="e.g. Adrian" 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                      <select 
                        aria-label="Employment Status"
                        title="Employment Status"
                        value={isFullTime ? "true" : "false"}
                        onChange={(e) => setIsFullTime(e.target.value === "true")}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="true">Full-Time (38-40 hrs)</option>
                        <option value="false">Part-Time (10-25 hrs)</option>
                      </select>
                    </div>
                    <button 
                      onClick={async () => {
                        if (!newEmpName.trim()) return;
                        setIsHiring(true);
                        const res = await fetch(`${API_URL}/api/employees`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ 
                            name: newEmpName, 
                            is_full_time: isFullTime,
                            min_hours: isFullTime ? 38 : 10,
                            max_hours: isFullTime ? 40 : 25,
                            branch_id: activeBranch.id,
                            skills: newEmpSkills.join(",") // NEW: Send as comma-separated string
                          })
                        });
                        if (res.ok) {
                          const newEmp = await res.json();
                          setRoster([...roster, newEmp]);
                          setNewEmpName("");
                          setNewEmpSkills([]); // Reset skills
                        }
                        setIsHiring(false);
                      }}
                      disabled={isHiring || !newEmpName.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md disabled:bg-gray-400 text-sm h-9.5"
                    >
                      {isHiring ? "Hiring..." : "Hire Employee"}
                    </button>
                  </div>
                  
                  {/* NEW: Skills Checkboxes */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2">Assigned Skills</label>
                    <div className="flex gap-4">
                      {availableSkills.map(skill => (
                        <label key={skill} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={newEmpSkills.includes(skill)}
                            onChange={() => toggleSkill(skill, newEmpSkills, setNewEmpSkills)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          {skill}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Roster Table */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-slate-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 font-medium text-slate-500">Name</th>
                        <th className="px-6 py-3 font-medium text-slate-500">Status</th>
                        <th className="px-6 py-3 font-medium text-slate-500">Target Hours</th>
                        <th className="px-6 py-3 font-medium text-slate-500 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.length > 0 ? (
                        roster.map((emp, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-slate-50">
                            {editingEmpId === emp.id ? (
                                /* --- EDIT MODE ROW --- */
                                <>
                                  <td className="px-6 py-2">
                                    <input 
                                      type="text" 
                                      aria-label="Edit employee name"
                                      title="Edit employee name"
                                      placeholder="Employee Name"
                                      value={editFormData.name}
                                      onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2"
                                    />
                                    {/* NEW: Skills Checkboxes inside the Edit row */}
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {availableSkills.map(skill => (
                                        <label key={skill} className="flex items-center gap-1 text-[11px] font-medium text-slate-600 cursor-pointer">
                                          <input 
                                            type="checkbox" 
                                            checked={editFormData.skills.includes(skill)}
                                            onChange={() => toggleSkill(skill, editFormData.skills, (newSkills) => setEditFormData({...editFormData, skills: newSkills}))}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                                          />
                                          {skill}
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-6 py-2">
                                    <select 
                                      aria-label="Edit employment status"
                                      title="Edit employment status"
                                      value={editFormData.is_full_time ? "true" : "false"}
                                      onChange={(e) => {
                                        const isFT = e.target.value === "true";
                                        setEditFormData({
                                          ...editFormData, 
                                          is_full_time: isFT,
                                          min_hours: isFT ? 38 : 10,
                                          max_hours: isFT ? 40 : 25
                                        });
                                      }}
                                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                                    >
                                      <option value="true">Full-Time</option>
                                      <option value="false">Part-Time</option>
                                    </select>
                                  </td>
                                  <td className="px-6 py-2">
                                    <div className="flex gap-2 items-center text-sm">
                                      <input 
                                        type="number" 
                                        aria-label="Edit minimum hours"
                                        title="Edit minimum hours"
                                        placeholder="Min"
                                        className="w-16 border border-gray-300 rounded px-2 py-1" 
                                        value={editFormData.min_hours} 
                                        onChange={(e) => setEditFormData({...editFormData, min_hours: parseInt(e.target.value)})} 
                                      />
                                      <span>-</span>
                                      <input 
                                        type="number" 
                                        aria-label="Edit maximum hours"
                                        title="Edit maximum hours"
                                        placeholder="Max"
                                        className="w-16 border border-gray-300 rounded px-2 py-1" 
                                        value={editFormData.max_hours} 
                                        onChange={(e) => setEditFormData({...editFormData, max_hours: parseInt(e.target.value)})} 
                                      />
                                    </div>
                                  </td>
                                  <td className="px-6 py-2 text-right">
                                    <button 
                                      onClick={async () => {
                                        const res = await fetch(`${API_URL}/api/employees/${emp.id}`, {
                                          method: "PUT",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            ...editFormData,
                                            skills: editFormData.skills.join(",") // NEW: Format array to comma-separated string for backend!
                                          })
                                        });
                                        if (res.ok) {
                                          const updatedEmp = await res.json();
                                          setRoster(roster.map(r => r.id === emp.id ? updatedEmp : r));
                                          setEditingEmpId(null);
                                        }
                                      }}
                                      className="text-emerald-600 hover:text-emerald-800 font-medium text-sm mr-3"
                                    >
                                      Save
                                    </button>
                                    <button onClick={() => setEditingEmpId(null)} className="text-gray-500 hover:text-gray-700 font-medium text-sm">Cancel</button>
                                  </td>
                                </>
                            ) : (
                              /* --- DISPLAY MODE ROW --- */
                              <>
                                <td className="px-6 py-3">
                                    <div className="font-semibold text-slate-700">{emp.name}</div>
                                    {/* NEW: Skill Badges */}
                                    {emp.skills && (
                                      <div className="flex gap-1 mt-1 flex-wrap">
                                        {emp.skills.split(",").map((skill: string, idx: number) => (
                                          <span key={idx} className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border border-amber-200">
                                            {skill}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                </td>
                                <td className="px-6 py-3">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${emp.is_full_time ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {emp.is_full_time ? "Full-Time" : "Part-Time"}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-slate-600">
                                  {emp.min_hours} - {emp.max_hours} hrs
                                </td>
                                <td className="px-6 py-3 text-right">
                                  <button 
                                    onClick={() => {
                                      setEditingEmpId(emp.id);
                                      setEditFormData({ 
                                        name: emp.name, 
                                        is_full_time: emp.is_full_time, 
                                        min_hours: emp.min_hours, 
                                        max_hours: emp.max_hours,
                                        skills: emp.skills ? emp.skills.split(",") : [] 
                                      });
                                    }}
                                    className="text-blue-600 hover:text-blue-800 font-medium text-sm mr-3"
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to fire ${emp.name}?`)) {
                                        const res = await fetch(`${API_URL}/api/employees/${emp.id}`, { method: "DELETE" });
                                        if (res.ok) {
                                          setRoster(roster.filter(r => r.id !== emp.id));
                                        }
                                      }
                                    }}
                                    className="text-red-500 hover:text-red-700 font-medium text-sm"
                                  >
                                    Fire
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                            No employees hired yet. Add someone to the roster!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* ---------------------------------------------------------------- */}

            {/* TOP: Current Scheduling Rules Widget */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
              <div className="bg-slate-100 border-b border-gray-200 px-6 py-3 flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-700">Current Scheduling Rules</h2>
                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border border-indigo-200">
                  Engine Active
                </span>
              </div>
              
              <div className="p-6 flex flex-col md:flex-row gap-8">
                {/* Left Column: Default Baseline Rules */}
                <div className="flex-1">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                    Baseline Compliance (Default)
                  </h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-emerald-500 mt-0.5">✔️</span>
                      <span><strong>Vault Coverage:</strong> Minimum 1 Vault-certified employee required per day.</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-emerald-500 mt-0.5">✔️</span>
                      <span><strong>Dual Control Opening:</strong> 1 Combo A and 1 Combo B required at 8:00 AM daily.</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-emerald-500 mt-0.5">✔️</span>
                      <span><strong>ATM Audits:</strong> 1 ATM-certified employee required to open on Mondays.</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-emerald-500 mt-0.5">✔️</span>
                      <span><strong>Contract Limits:</strong> Strict enforcement of minimum/maximum weekly hours per employee.</span>
                    </li>
                  </ul>
                </div>
                
                {/* Divider */}
                <div className="hidden md:block w-px bg-gray-200"></div>

                {/* Right Column: AI Custom Rules */}
                <div className="flex-1">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                    ✨ AI Custom Overrides
                  </h3>
                  
                  {customRules.length > 0 ? (
                    <ul className="space-y-2">
                      {customRules.map((rule, idx) => (
                        <li key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center shadow-sm">
                          <div className="flex items-center gap-2.5 text-sm text-slate-700 font-medium">
                            <span className="text-blue-500 bg-blue-100 p-1 rounded">✨</span>
                            <span>{rule.description}</span>
                          </div>
                          <button 
                            onClick={async () => {
                              await fetch(`${API_URL}/api/rules/${rule.id}`, { method: "DELETE" });
                              fetchRules(); // Refresh the list!
                            }}
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                            title="Delete Rule"
                          >
                            ❌
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center h-32 text-center">
                      <span className="text-slate-400 mb-1 text-xl">🤖</span>
                      <p className="text-sm font-medium text-slate-500">No custom rules active.</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                        Use the AI Assistant to add temporary constraints (e.g., "Give Kristina Saturday off").
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* --- NOTIFICATION BANNERS --- */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded shadow-sm mb-6 flex items-center">
                <span className="text-xl mr-2">⚠️</span>
                <div>
                  <span className="font-bold">Generation Failed: </span>
                  {error}
                </div>
              </div>
            )}
            
            {successMsg && (
              <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 px-4 py-3 rounded shadow-sm mb-6 flex items-center">
                <span className="text-xl mr-2">✅</span>
                <span className="font-medium">{successMsg}</span>
              </div>
            )}
            {/* ----------------------------------------- */}

            {schedule ? (
              <div className="space-y-6">
                
                {/* Weekly Hours Summary Widget */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-slate-100 border-b border-gray-200 px-6 py-3">
                    <h2 className="text-lg font-bold text-slate-700">Scheduled Hours Summary</h2>
                  </div>
                  <div className="p-4 flex flex-wrap gap-3">
                    {employeeTotals?.map(([name, hours]) => (
                      <div key={name} className="bg-blue-50 border border-blue-100 px-4 py-2 rounded-lg text-sm flex justify-between items-center w-48 shadow-sm">
                        <span className="font-semibold text-slate-700">{name}</span>
                        <span className={`font-bold ${hours > 40 ? 'text-red-600' : 'text-blue-700'}`}>
                          {hours.toFixed(2)} hrs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Schedule breakdown */}
                {Object.keys(schedule).map((day) => (
                  <div key={day} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-slate-100 border-b border-gray-200 px-6 py-3">
                      <h2 className="text-xl font-bold text-slate-700">{day}</h2>
                    </div>
                    <div className="p-0">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-sm border-b border-gray-100">
                            <th className="px-6 py-3 font-medium">Location</th>
                            <th className="px-6 py-3 font-medium">Employee</th>
                            <th className="px-6 py-3 font-medium">Shift</th>
                            <th className="px-6 py-3 font-medium">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule[day].map((shift: any, index: number) => (
                            <tr key={index} className="border-b border-gray-50 hover:bg-blue-50">
                              <td className="px-6 py-3 font-medium">
                                <span className={`px-2 py-1 rounded text-xs ${shift.location === 'Paramus' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {shift.location}
                                </span>
                              </td>
                              {/* EMPLOYEE COLUMN */}
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                  {/* Employee Name */}
                                  <span className="font-semibold text-slate-800">
                                    {shift.employee_name}
                                  </span>
                                  
                                  {/* 1. The Clean Hoverable Opener Sun */}
                                  {shift.is_opening && (
                                    <span 
                                      title="Scheduled Opener" 
                                      className="cursor-help text-amber-500 text-[13px] hover:scale-125 transition-transform"
                                    >
                                      ☀️
                                    </span>
                                  )}

                                  {/* 2. The Minimalist Skill Badges */}
                                  <div className="flex gap-1 ml-1">
                                    {/* Wrap both IDs in String() to safely compare them! */}
                                    {roster.find(r => String(r.id) === String(shift.employee_id))?.skills?.split(",").map((skill: string, idx: number) => {
                                      const s = skill.trim();
                                      if (!s) return null;
                                      
                                      // Compress the Combo names to just "A" or "B"
                                      let display = s;
                                      if (s === "Combo A") display = "A";
                                      if (s === "Combo B") display = "B";

                                      return (
                                        <span 
                                          key={idx} 
                                          title={s}
                                          className="text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-px rounded-sm cursor-help tracking-wider flex items-center justify-center shadow-sm hover:bg-slate-200 transition-colors"
                                        >
                                          {display}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-slate-600 font-medium">
                                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                              </td>
                              <td className="px-6 py-3 text-slate-600 font-medium">{shift.paid_hours} hrs</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-xl font-medium text-gray-400">No schedule generated yet.</h3>
                <p className="text-gray-400 mt-2">Generate a schedule or ask the AI to do it for you.</p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: AI Chat Assistant */}
          <div className="w-96 bg-white rounded-xl shadow-md border border-gray-200 flex flex-col h-[calc(100vh-4rem)] sticky top-8">
            <div className="bg-slate-900 text-white px-6 py-4 rounded-t-xl relative overflow-hidden">
              <h2 className="font-bold text-lg relative z-10 flex items-center gap-2">
                AI Assistant
              </h2>
              <p className="text-sm font-medium mt-0.5 relative z-10 text-slate-300">
                Powered by{' '}
                <span className="bg-linear-to-r from-blue-400 via-purple-400 to-rose-400 text-transparent bg-clip-text drop-shadow-[0_0_12px_rgba(192,132,252,0.8)] font-bold tracking-wide">
                  Gemini
                </span>
              </p>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-4 py-2 text-sm shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-slate-700'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 text-slate-500 rounded-lg px-4 py-2 text-sm shadow-sm animate-pulse">
                    Thinking...
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-200 rounded-b-xl">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message the AI..." 
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button 
                  type="submit" 
                  disabled={isTyping}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors text-sm font-semibold"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>
    </main>
  );
}
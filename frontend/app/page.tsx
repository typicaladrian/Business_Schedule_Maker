"use client";

import { useState, useMemo, useEffect } from "react";

import { UserButton, Show, SignInButton, useUser } from "@clerk/nextjs";

export default function Home() {
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

  // NEW: Clerk User Hook
  const { isLoaded, isSignedIn, user } = useUser();
  const [managerId, setManagerId] = useState<number | null>(null);

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
  
  const availableSkills = ["Combo A", "Combo B", "Vault", "ATM"];
  const toggleSkill = (skill: string, currentSkills: string[], setSkillsFn: (s: string[]) => void) => {
    if (currentSkills.includes(skill)) {
      setSkillsFn(currentSkills.filter(s => s !== skill));
    } else {
      setSkillsFn([...currentSkills, skill]);
    }
  };

  // NEW: Sync with the Python backend whenever the user logs in
  useEffect(() => {
    if (isSignedIn && user) {
      const syncManager = async () => {
        try {
          const response = await fetch("http://127.0.0.1:8000/api/managers/sync", {
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
            const branchRes = await fetch(`http://127.0.0.1:8000/api/branches/${data.manager_id}`);
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

  // NEW: Fetch Roster when active branch changes
  useEffect(() => {
    if (activeBranch) {
      const fetchRoster = async () => {
        const res = await fetch(`http://127.0.0.1:8000/api/branches/${activeBranch.id}/employees`);
        if (res.ok) {
          const data = await res.json();
          setRoster(data.employees);
        }
      };
      fetchRoster();
    }
  }, [activeBranch]);

  // NEW: Fetch the live employee rules from the database
  const fetchEmployees = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/employees");
      if (response.ok) {
        const data = await response.json();
        setEmployees(data.employees);
      }
    } catch (err) {
      console.error("Could not load employee data.");
    }
  };

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
      const response = await fetch(`http://127.0.0.1:8000/api/branches/${activeBranch.id}/schedule`);
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

    const userText = chatInput;
    setMessages(prev => [...prev, { role: "user", content: userText }]);
    setChatInput("");
    setIsTyping(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText })
      });
      
      const data = await response.json();
      setMessages(prev => [...prev, { role: "ai", content: data.reply }]);
      
      // NEW: Always refresh the employee rules panel after the AI does something!
      fetchEmployees();

      if (data.reply.toLowerCase().includes("generated") || data.reply.toLowerCase().includes("schedule")) {
        fetchSchedule();
      }
      
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", content: "Sorry, I couldn't reach the backend server." }]);
    } finally {
      setIsTyping(false);
    }
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
      <div className="max-w-7xl mx-auto flex gap-8">
        
        {/* LEFT COLUMN: Schedule View */}
        <div className="flex-1">
          <header className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-blue-900">Branch Schedule Manager</h1>
              <p className="text-gray-500 mt-1">AI-Powered Optimization Engine</p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* THE MISSING BUTTON IS BACK! */}
              <Show when="signed-in">
                <button 
                  onClick={fetchSchedule}
                  disabled={loading || !activeBranch}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md transition-all disabled:bg-gray-400"
                >
                  {loading ? "Generating..." : "Generate Schedule"}
                </button>
              </Show>

              {/* Clerk Authentication Buttons */}
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
          {/* ---------------------------- */}

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
                    const res = await fetch("http://127.0.0.1:8000/api/branches", {
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
                      const res = await fetch(`http://127.0.0.1:8000/api/branches/${activeBranch.id}/settings`, {
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
                      const res = await fetch("http://127.0.0.1:8000/api/employees", {
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
                                      const res = await fetch(`http://127.0.0.1:8000/api/employees/${emp.id}`, {
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
                                      const res = await fetch(`http://127.0.0.1:8000/api/employees/${emp.id}`, { method: "DELETE" });
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

              {/* Right Column: AI Custom Rules Placeholder */}
              <div className="flex-1">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  ✨ AI Custom Overrides
                </h3>
                
                {/* NOTE: We will map over a state variable here later when we connect the AI! 
                  For now, we show a clean empty state.
                */}
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center h-32 text-center">
                  <span className="text-slate-400 mb-1">🤖</span>
                  <p className="text-sm font-medium text-slate-500">No custom rules active.</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Use the AI Assistant to add temporary constraints (e.g., "Give Gilda Friday off").
                  </p>
                </div>
              </div>
            </div>
          </div>

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
                                  {/* THE FIX: Wrap both IDs in String() to safely compare them! */}
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
                              {shift.start_time} - {shift.end_time}
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
          <div className="bg-blue-900 text-white px-6 py-4 rounded-t-xl">
            <h2 className="font-bold text-lg">AI Assistant</h2>
            <p className="text-blue-200 text-sm">Powered by Gemini</p>
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
    </main>
  );
}
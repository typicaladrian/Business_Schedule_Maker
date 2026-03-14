"use client";

import { useState, useMemo, useEffect } from "react";

export default function Home() {
  const [schedule, setSchedule] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Chat States
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: "ai", content: "Hello! I am your AI Scheduling Assistant. You can ask me to generate a schedule, or tell me if an employee needs time off." }
  ]);

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
    setLoading(true);
    setError("");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/test-schedule");
      if (!response.ok) throw new Error("Failed to generate schedule.");
      const data = await response.json();
      
      const sortedSchedule: any = {};
      Object.keys(data.schedule).forEach(day => {
        sortedSchedule[day] = data.schedule[day].sort((a: any, b: any) => {
          const locationCompare = a.location.localeCompare(b.location);
          if (locationCompare !== 0) return locationCompare;
          return a.start_time.localeCompare(b.start_time);
        });
      });
      
      setSchedule(sortedSchedule);
    } catch (err: any) {
      setError(err.message);
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
            <button 
              onClick={fetchSchedule}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md transition-all disabled:bg-gray-400"
            >
              {loading ? "Generating..." : "Generate Schedule"}
            </button>
          </header>

          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">{error}</div>}

          {/* TOP: Live Employee Rules Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="bg-slate-100 border-b border-gray-200 px-6 py-3">
              <h2 className="text-lg font-bold text-slate-700">Live Employee Rules</h2>
            </div>
            <div className="p-0 max-h-48 overflow-y-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-gray-200 shadow-sm">
                  <tr>
                    <th className="px-6 py-2 font-medium text-slate-500">Employee</th>
                    <th className="px-6 py-2 font-medium text-slate-500">Allowed Hours</th>
                    <th className="px-6 py-2 font-medium text-slate-500">Unavailable Days</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-slate-50">
                      <td className="px-6 py-2 font-semibold text-slate-700">{emp.name}</td>
                      <td className="px-6 py-2 text-slate-600">
                        {emp.min_hours_per_week} - {emp.max_hours_per_week} hrs
                      </td>
                      <td className="px-6 py-2 text-slate-600">
                        {emp.unavailable_days.length > 0 
                          ? <span className="text-red-500 font-medium bg-red-50 px-2 py-1 rounded">{emp.unavailable_days.join(", ")}</span> 
                          : <span className="text-gray-400 italic">None</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                            <td className="px-6 py-3 font-semibold text-slate-800">{shift.employee_name}</td>
                            <td className="px-6 py-3 text-slate-600 flex items-center gap-2">
                              {shift.start_time} - {shift.end_time}
                              {shift.is_opening && (
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-amber-200" title="Opening Shift">
                                  ☀️ Opener
                                </span>
                              )}
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
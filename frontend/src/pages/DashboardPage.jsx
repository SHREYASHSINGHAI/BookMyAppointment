import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Users, Calendar, TrendingUp, MessageSquare, Bell, Settings, LogOut, Bot, CheckCircle2, Clock, Phone, AlertTriangle } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

const DashboardPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const userPlan = localStorage.getItem('userPlan') || 'starter';
  
  const [profile, setProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchDashboardData = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
        const currentClinic = localStorage.getItem('activeClinicId') || localStorage.getItem('dentistId');
        
        // Fetch Profile
        const profileRes = await fetch(`${API_BASE}/api/dentist/profile`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'X-Clinic-ID': currentClinic
          }
        });
        
        if (profileRes.status === 401 || profileRes.status === 404) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPlan');
          localStorage.removeItem('dentistId');
          navigate('/login');
          return;
        }

        const profileData = await profileRes.json();
        if (profileData.error) throw new Error(profileData.error);
        setProfile(profileData);

        // Fetch Appointments
        const apptsRes = await fetch(`${API_BASE}/api/dentist/appointments`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'X-Clinic-ID': currentClinic
          }
        });

        if (apptsRes.status === 401 || apptsRes.status === 404) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userPlan');
          localStorage.removeItem('dentistId');
          navigate('/login');
          return;
        }

        const apptsData = await apptsRes.json();
        setAppointments(apptsData.appointments || []);
      } catch (err) {
        console.error('Error fetching dashboard details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userPlan');
    localStorage.removeItem('dentistId');
    navigate('/login');
  };



  const stats = [
    { label: 'Synced Appointments', value: loading ? '...' : appointments.length, change: 'Live', icon: Calendar, color: 'blue' },
    { label: 'AI Processed Queries', value: loading ? '...' : '100% Active', change: 'Active', icon: MessageSquare, color: 'teal' },
    { label: 'No-Show Recovery', value: 'Active', change: '6h Rule', icon: Activity, color: 'green' },
    { label: 'Current Revenue Leak', value: '₹0.00', change: 'Optimized', icon: TrendingUp, color: 'indigo' }
  ];

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const displayActivity = appointments.length > 0
    ? appointments.slice(0, 10).map((a) => ({
        patient: a.patientName || 'Unknown Patient',
        action: `Booked ${a.service || 'Service'}`,
        time: new Date(a.dateTime).toLocaleDateString() + ' ' + new Date(a.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: a.status || 'confirmed'
      }))
    : [
        { patient: 'No Sync Data', action: 'Awaiting first patient interaction', time: 'Now', status: 'pending' }
      ];

  // Helper to resolve CSS colors based on stat definition
  const getStatColorClasses = (color) => {
    switch (color) {
      case 'blue':
        return { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-600', icon: 'text-blue-500' };
      case 'teal':
        return { bg: 'bg-teal-50 border-teal-100', text: 'text-teal-600', icon: 'text-teal-500' };
      case 'green':
        return { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-600', icon: 'text-[#10b981]' };
      case 'indigo':
      default:
        return { bg: 'bg-indigo-50 border-indigo-100', text: 'text-indigo-600', icon: 'text-indigo-500' };
    }
  };

  return (
    <div className="flex min-h-screen bg-white text-[#0a2540]">
      {/* Sidebar */}
      <Sidebar handleLogout={handleLogout} />

      {/* Main Content */}
      <main className="flex-1 p-8 lg:p-12 overflow-y-auto bg-gray-50/30">
        <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase mb-2 text-[#0a2540]">
              {profile?.clinicName || 'Practice'} <span className="text-gradient-clinical">Dashboard</span>
            </h1>
            <p className="text-gray-500 font-medium">System Status: <span className="text-[#10b981] font-bold">All Nodes Active</span> | Clinical Sync: <span className="text-[#0a2540] font-black">100%</span></p>
          </div>
          <div className="flex gap-4">
            <div className="px-6 py-4 bg-white border border-gray-100 rounded-2xl flex items-center gap-6 shadow-sm">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#0a2540]/60">
                <div className={`w-2 h-2 rounded-full animate-pulse ${profile?.calendarConnected ? 'bg-[#10b981]' : 'bg-red-500'}`} />
                Calendar: {profile?.calendarConnected ? 'Active' : 'Disconnected'}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#0a2540]/60">
                <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse" />
                Database: Connected
              </div>
            </div>
            <div className="w-12 h-12 bg-[#0a2540] text-white rounded-xl flex items-center justify-center font-black shadow-sm">
              {profile?.name ? getInitials(profile.name) : 'DR'}
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {stats.map((stat, i) => {
            const colors = getStatColorClasses(stat.color);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="clinical-card p-8 group bg-white shadow-sm"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${colors.bg}`}>
                    <stat.icon className={`w-6 h-6 ${colors.icon}`} />
                  </div>
                  <span className="text-xs font-black text-[#10b981]">
                    {stat.change}
                  </span>
                </div>
                <div className="text-3xl font-black mb-1 tracking-tight text-[#0a2540]">{stat.value}</div>
                <div className="text-[10px] text-[#0a2540]/60 font-black uppercase tracking-widest">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>

        {/* Analytics & Activity */}
        <div className="w-full">
          {/* Live Feed */}
          <div className="space-y-8">
            <div className="clinical-card p-10 bg-white h-full shadow-sm">
              <h3 className="text-lg font-black uppercase tracking-widest mb-8 flex items-center gap-3 text-[#0a2540]">
                <Activity className="w-5 h-5 text-[#10b981]" /> Live AI Operations
              </h3>
              <div className="space-y-6">
                {displayActivity.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-6 bg-white border border-gray-100 rounded-2xl hover:border-[#10b981]/20 transition-all group shadow-sm">
                    <div className="flex items-center gap-6">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xs font-black ${
                          item.status === 'confirmed' ? 'bg-[#10b981]/15 text-[#10b981]' :
                          item.status === 'pending' ? 'bg-amber-500/15 text-amber-600' : 'bg-blue-500/15 text-blue-600'
                        }`}>
                        {getInitials(item.patient)}
                      </div>
                      <div>
                        <div className="font-bold text-[#0a2540] group-hover:text-[#10b981] transition-colors">{item.patient}</div>
                        <div className="text-xs text-gray-500 font-medium">{item.action}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[#0a2540]/40 mb-1">{item.time}</div>
                      <div className={`text-[10px] font-black uppercase tracking-widest ${
                          item.status === 'confirmed' ? 'text-[#10b981]' :
                          item.status === 'pending' ? 'text-amber-600' : 'text-blue-600'
                        }`}>{item.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;

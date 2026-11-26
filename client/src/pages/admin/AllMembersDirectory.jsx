import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { useSocket } from '@/context/socket-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

/**
 * All Members Directory – Admin view
 * Shows every employee, whether they have any product contexts, and allows direct CRUD.
 * Uses existing knowledge API endpoints (GET /knowledge/contexts, POST /contexts, PUT /contexts/:id, DELETE /contexts/:id).
 */
const AllMembersDirectory = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [users, setUsers] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContext, setEditingContext] = useState(null);
  const [formProductId, setFormProductId] = useState('BHIV');
  const [formProductName, setFormProductName] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
    return { 'Content-Type': 'application/json', 'x-auth-token': token, Authorization: `Bearer ${token}` };
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [usersRes, ctxRes] = await Promise.all([
        axios.get(`${API_URL}/admin/users`, { headers }),
        axios.get(`${API_URL}/knowledge/contexts?limit=1000`, { headers })
      ]);
      setUsers(usersRes.data || []);
      setContexts(ctxRes.data?.items || []);
    } catch (err) {
      console.warn('Failed to load directory data:', err.message);
      toast({ title: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real‑time sync via socket (same events as KnowledgeAdmin)
  useEffect(() => {
    if (!socket) return;
    const sync = () => fetchData();
    socket.on('knowledge:context:created', sync);
    socket.on('knowledge:context:updated', sync);
    socket.on('knowledge:context:deleted', sync);
    return () => {
      socket.off('knowledge:context:created', sync);
      socket.off('knowledge:context:updated', sync);
      socket.off('knowledge:context:deleted', sync);
    };
  }, [socket, fetchData]);

  const openAddModal = (user) => {
    setEditingContext({ employeeId: user.effectiveEmployeeId, userId: user._id });
    setFormProductId('BHIV');
    setFormProductName('');
    setFormContent('');
    setFormSummary('');
    setModalOpen(true);
  };

  const openEditModal = (ctx) => {
    setEditingContext(ctx);
    setFormProductId(ctx.productId || 'BHIV');
    setFormProductName(ctx.productName || '');
    setFormContent(ctx.content || '');
    setFormSummary(ctx.summary || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formContent.trim()) {
      toast({ title: 'Content required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const headers = getAuthHeaders();
    const payload = {
      productId: formProductId,
      productName: formProductName,
      content: formContent.trim(),
      summary: formSummary.trim(),
    };
    try {
      if (editingContext && editingContext._id) {
        // Update existing context
        await axios.put(`${API_URL}/contexts/${editingContext._id}`, payload, { headers });
      } else {
        // New context – include employeeId from user
        payload.employeeId = editingContext.employeeId;
        await axios.post(`${API_URL}/contexts`, payload, { headers });
      }
      toast({ title: 'Context saved', variant: 'success' });
      setModalOpen(false);
      fetchData();
    } catch (err) {
      console.warn('Save error:', err.message);
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ctx) => {
    if (!window.confirm('Delete this context?')) return;
    const headers = getAuthHeaders();
    try {
      await axios.delete(`${API_URL}/contexts/${ctx._id}`, { headers });
      toast({ title: 'Deleted', variant: 'success' });
      fetchData();
    } catch (err) {
      console.warn('Delete error:', err.message);
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const employeeContexts = (empId) => contexts.filter(c => (c.employeeId || '').toUpperCase() === empId.toUpperCase());

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>All Members Directory</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Employee ID</th>
                <th className="p-2 text-left">Has Context</th>
                <th className="p-2 text-left">Products</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const empId = (u.canonicalEmployeeId || u.employeeId || '').toUpperCase();
                const ctxs = employeeContexts(empId);
                const productList = ctxs.map(c => c.productId).join(', ');
                return (
                  <tr key={u._id} className="border-b">
                    <td className="p-2">{u.name}</td>
                    <td className="p-2">{empId}</td>
                    <td className="p-2">{ctxs.length > 0 ? '✅' : '❌'}</td>
                    <td className="p-2">{productList}</td>
                    <td className="p-2 space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openAddModal(u)}>Add</Button>
                      {ctxs.map(c => (
                        <React.Fragment key={c._id}>
                          <Button variant="secondary" size="sm" onClick={() => openEditModal(c)}>{c.productId}</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(c)}>Del</Button>
                        </React.Fragment>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>

      {/* Modal for Add / Edit */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContext && editingContext._id ? 'Edit Context' : 'Add Context'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <label>Product ID</label>
            <input className="border rounded p-1" value={formProductId} onChange={e => setFormProductId(e.target.value)} />
            <label>Product Name</label>
            <input className="border rounded p-1" value={formProductName} onChange={e => setFormProductName(e.target.value)} />
            <label>Content</label>
            <textarea className="border rounded p-1" rows={4} value={formContent} onChange={e => setFormContent(e.target.value)} />
            <label>Summary (optional)</label>
            <input className="border rounded p-1" value={formSummary} onChange={e => setFormSummary(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>Save</Button>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AllMembersDirectory;

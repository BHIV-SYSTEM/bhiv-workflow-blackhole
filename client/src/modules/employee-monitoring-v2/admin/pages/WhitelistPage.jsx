/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Administration — Whitelist & Process Categories Page
 */

import React, { useState } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.jsx';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { ListFilter, Plus, ShieldCheck, Check } from 'lucide-react';

const INITIAL_RULES = [
  { process: 'code.exe / Code / visual-studio-code', category: 'DEVELOPMENT', platform: 'All OS', workProductive: true },
  { process: 'idea64.exe / pycharm / clion', category: 'DEVELOPMENT', platform: 'All OS', workProductive: true },
  { process: 'figma.exe / Figma', category: 'DEVELOPMENT', platform: 'All OS', workProductive: true },
  { process: 'slack.exe / Slack', category: 'COMMUNICATION', platform: 'All OS', workProductive: true },
  { process: 'teams.exe / msteams', category: 'COMMUNICATION', platform: 'All OS', workProductive: true },
  { process: 'chrome.exe (Work tab) / edge.exe', category: 'DOCUMENTATION', platform: 'All OS', workProductive: true },
  { process: 'spotify.exe / steam.exe', category: 'EXCLUDED_PERSONAL', platform: 'All OS', workProductive: false },
];

export const WhitelistPage = () => {
  const [rules, setRules] = useState(INITIAL_RULES);
  const [newProcess, setNewProcess] = useState('');
  const [newCategory, setNewCategory] = useState('DEVELOPMENT');

  const handleAddRule = (e) => {
    e.preventDefault();
    if (!newProcess.trim()) return;
    setRules([
      ...rules,
      {
        process: newProcess.trim(),
        category: newCategory,
        platform: 'All OS',
        workProductive: newCategory !== 'EXCLUDED_PERSONAL',
      },
    ]);
    setNewProcess('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-indigo-400" />
            <span>Application Whitelist & Work Categories</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Classifies binary process names into high-level categories without URL tracking or screen scraping
          </p>
        </div>
      </div>

      {/* Add rule card */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleAddRule} className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 w-full">
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Process Name / Binary Signature
              </label>
              <input
                type="text"
                placeholder="e.g. docker-desktop.exe or postman"
                value={newProcess}
                onChange={(e) => setNewProcess(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="w-full sm:w-56">
              <label className="text-xs font-semibold text-slate-400 block mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="DEVELOPMENT">DEVELOPMENT</option>
                <option value="DOCUMENTATION">DOCUMENTATION</option>
                <option value="COMMUNICATION">COMMUNICATION</option>
                <option value="SUPPORT">SUPPORT</option>
                <option value="NEUTRAL">NEUTRAL</option>
                <option value="EXCLUDED_PERSONAL">EXCLUDED_PERSONAL</option>
              </select>
            </div>
            <Button variant="primary" size="md" icon={Plus} type="submit" className="w-full sm:w-auto">
              Add Categorization Rule
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Rules table */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Category Rules ({rules.length})</CardTitle>
          <CardDescription>
            Process matching runs strictly locally on the desktop agent; only categorical summary is transmitted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Process Name</TableHead>
                <TableHead>Assigned Category</TableHead>
                <TableHead>Target Platforms</TableHead>
                <TableHead>Classification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-slate-200 text-xs font-semibold">
                    {rule.process}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.category === 'EXCLUDED_PERSONAL' ? 'danger' : 'purple'}>
                      {rule.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">{rule.platform}</TableCell>
                  <TableCell>
                    {rule.workProductive ? (
                      <span className="text-emerald-400 text-xs font-medium">Work Productive</span>
                    ) : (
                      <span className="text-slate-500 text-xs font-medium">Personal / Ignored</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhitelistPage;

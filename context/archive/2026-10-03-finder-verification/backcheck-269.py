#!/usr/bin/env python3
"""Backward check behind research.md item 7 (finder-verification, 2026-10-03): for each of the 38 luna findings on
PR #269 (archive finder-model-swap), does the cited file:startLine-endLine contain the evidence lines the owner
used to classify its row (hand-read-269-presort.md)? Computes cited-range / +-N / enclosing-function / whole-file
coverage and whether the cited lines sit in a #269 hunk. Read-only over git and the archive; no model calls.
Run from the repo root: python3 context/changes/finder-verification/backcheck-269.py
(writes backcheck-269-results.json next to this file). Written by the research agent; kept as a companion file."""
import os
import json, re, subprocess, sys
ARCH='context/archive/2026-10-02-finder-model-swap/'
REV='fca2778'; BASE='3d0adc1'

def show(path):
    return subprocess.run(['git','show',f'{REV}:{path}'],capture_output=True,text=True,check=True).stdout.split('\n')

def diff_new_lines(path):
    """Return dict newline -> '+' (added) or ' ' (context) for hunks of the PR diff."""
    out=subprocess.run(['git','diff',f'{BASE}...{REV}','--',path],capture_output=True,text=True,check=True).stdout.split('\n')
    tag={}; hunks=[]
    new=None
    for l in out:
        m=re.match(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@',l)
        if m:
            new=int(m.group(1)); cnt=int(m.group(2) or 1); hunks.append((new,new+cnt-1)); continue
        if new is None: continue
        if l.startswith('+'): tag[new]='+'; new+=1
        elif l.startswith('-'): pass
        elif l.startswith('\\'): pass
        else: tag[new]=' '; new+=1
    return tag,hunks

# ---- function spans (top-level) ----
def py_funcs(lines):
    spans=[]; cur=None
    for i,l in enumerate(lines,1):
        if re.match(r'^def (\w+)',l):
            if cur: spans.append(cur)
            cur=[re.match(r'^def (\w+)',l).group(1),i,i]
        elif cur and l and not l[0].isspace():  # new top-level statement
            spans.append(cur); cur=None
        elif cur and l.strip():
            cur[2]=i
    if cur: spans.append(cur)
    return [tuple(s) for s in spans]

def ts_funcs(lines):
    spans=[]; cur=None
    for i,l in enumerate(lines,1):
        m=re.match(r'^(?:export )?(?:async )?function (\w+)',l)
        if m and cur is None:
            cur=[m.group(1),i,i]
        elif cur and l.startswith('}'):
            cur[2]=i; spans.append(tuple(cur)); cur=None
    return spans

FILES=['scripts/s17/decode-inputs.py','scripts/s17/contact-sheet.py','scripts/s17/desktop-stats.ts',
       'scripts/s17/auto-values.ts','scripts/s17/browser-stats.ts','scripts/s17/harness.ts',
       'scripts/spikes/bread-spike.ts','scripts/measure-hue-shares.py']
SRC={}; FUNCS={}; DIFF={}
for f in FILES:
    SRC[f]=show(f)
    FUNCS[f]=py_funcs(SRC[f]) if f.endswith('.py') else ts_funcs(SRC[f])
    DIFF[f]=diff_new_lines(f)
# doc-comment block for bread-spike localInput starts with /** at 166; function keyword at 167 — fine.
print('FUNCTION SPANS')
for f in FILES:
    print(' ',f, FUNCS[f])
print('HUNKS (new side)')
for f in ['scripts/spikes/bread-spike.ts','scripts/measure-hue-shares.py']:
    print(' ',f, DIFF[f][1])

def func_of(f,line):
    for name,a,b in FUNCS[f]:
        if a<=line<=b: return (name,a,b)
    return None

# ---- evidence per D row (from hand-read-269-presort.md, column "Evidence at fca2778") ----
def rng(a,b=None): return list(range(a,(b or a)+1))
EVID={
 'D1': {'scripts/s17/decode-inputs.py': rng(131,142)}, 
 'D2': {'scripts/spikes/bread-spike.ts': [79]+rng(91,96)+rng(189,195)+rng(198,213)},
 'D3': {'scripts/s17/contact-sheet.py': rng(150,151), 'scripts/spikes/bread-spike.ts':[233]},
 'D4': {'scripts/s17/decode-inputs.py': rng(1,49)},
 'D5': {},
 'D6': {'scripts/s17/auto-values.ts': rng(14,16)},
 'D7': {'scripts/s17/contact-sheet.py': rng(208,211)},
 'D8': {'scripts/s17/desktop-stats.ts': rng(103,136)},
 'D9': {'scripts/s17/desktop-stats.ts': rng(18,23)+rng(92,100)+rng(104,111)},
 'D10':{'scripts/s17/desktop-stats.ts': rng(18,23)+rng(56,62)+rng(92,100)},
 'D11':{'scripts/measure-hue-shares.py': rng(113,114)+rng(127,132)+rng(150,152)},
 'D12':{'scripts/measure-hue-shares.py': rng(37,41)+rng(143,144)},
 'D13':{'scripts/s17/contact-sheet.py': rng(208,211)+[215]+rng(221,222)},
 'D14':{'scripts/s17/contact-sheet.py': rng(20,24)+rng(139,146)+[151]},
 'D15':{'scripts/s17/decode-inputs.py': rng(137,140)+rng(146,149)},
 'D16':{'scripts/s17/decode-inputs.py': rng(175,176)+rng(183,193)+[170]},
 'D17':{'scripts/s17/decode-inputs.py': rng(88,102)+rng(135,140)+rng(146,149)},
 'D18':{'scripts/s17/auto-values.ts': rng(39,41), 'scripts/s17/decode-inputs.py': rng(183,185), 'scripts/s17/browser-stats.ts': rng(80,84)},
 'D19':{'scripts/s17/browser-stats.ts': rng(162,191), 'scripts/s17/harness.ts': rng(43,51)},
 'D20':{'scripts/spikes/bread-spike.ts': rng(117,121)+rng(91,96)},
}
# non-line evidence named by the presort (outside any file:line in the cited file)
NONLINE={
 'D1':'hand-read-269-checks.py experiment', 'D3':'id format (26 base32 chars; calibration.md)',
 'D4':'PR file list (no test file); .github/ai-review-rules.md § Testing bar', 'D5':'PR file list; ai-review-rules.md § Testing bar',
 'D6':'PR file list', 'D7':'PR file list', 'D8':'PR file list', 'D11':'test-photos/s17-benchmark.json ROI values',
 'D15':'Pillow 12.3.0 JpegImageFile.draft source', 'D17':'hand-read-269-checks.py experiment',
}
EVTXT={
 'D1':'decode-inputs.py:131–142','D2':'bread-spike.ts:79, 91–96, 189–195, 198–213','D3':'contact-sheet.py:150–151; bread-spike.ts:233',
 'D4':'decode-inputs.py:1–49; PR file list; rules § Testing bar','D5':'PR file list; rules § Testing bar','D6':'auto-values.ts:14–16; PR file list',
 'D7':'contact-sheet.py:208–211; PR file list','D8':'desktop-stats.ts:103–136; PR file list','D9':'desktop-stats.ts:18–23, 92–100, 104–111',
 'D10':'desktop-stats.ts:18–23, 56–62, 92–100','D11':'measure-hue-shares.py:113–114, 127–132, 150–152; s17-benchmark.json',
 'D12':'measure-hue-shares.py:37–41, 143–144','D13':'contact-sheet.py:208–211, 215, 221–222','D14':'contact-sheet.py:20–24, 139–146, 151',
 'D15':'decode-inputs.py:137–140, 146–149; Pillow draft()','D16':'decode-inputs.py:175–176, 183–193, 170','D17':'decode-inputs.py:88–102, 135–140, 146–149',
 'D18':'auto-values.ts:39–41 (cf. decode-inputs.py:183–185, browser-stats.ts:80–84)','D19':'browser-stats.ts:162–191; harness.ts:43–51',
 'D20':'bread-spike.ts:117–121, 91–96',
}

rows=json.load(open(ARCH+'hand-read-openai.json'))
ref2row={}
for r in rows:
    for ref in r['findings']: ref2row[ref]=r['id']

# ---- findings ----
att=[]
for line in open(ARCH+'gate-openai-pr269.jsonl'):
    line=line.strip()
    if not line: continue
    o=json.loads(line)
    if o.get('kind')!='attempt': continue
    for i,f in enumerate(o['findings'],1):
        att.append((f"{o['attempt']}.{i}",f))
assert len(att)==38, len(att)

def norm(path): return path.rstrip('/')

results=[]
for ref,f in att:
    row=ref2row[ref]
    file=norm(f['file']); s=f.get('startLine'); e=f.get('endLine') or s
    is_dir = file not in SRC
    file_level = (not is_dir) and (s==1 and (e==1 or e==len(SRC[file])-1 or e==len(SRC[file])))
    ev_file=EVID[row].get(file,[]) if not is_dir else []
    ev_other={k:v for k,v in EVID[row].items() if k!=file}
    nonline=NONLINE.get(row)
    # containment
    if is_dir or s is None:
        contain='n/a (dir)'; dist=None; N=None; fn=None; fn_cov=None
    else:
        inside=[x for x in ev_file if s<=x<=e]
        if not ev_file: contain='n/a (no line evidence in cited file)'
        elif len(inside)==len(ev_file): contain='yes'
        elif inside: contain='partly'
        else: contain='no'
        dist = 0 if inside else (min(min(abs(x-s),abs(x-e)) for x in ev_file) if ev_file else None)
        N = max([max(s-x,x-e,0) for x in ev_file]) if ev_file else None
        fn=func_of(file,s)
        fn_cov = (all(fn[1]<=x<=fn[2] for x in ev_file) if (fn and ev_file) else False)
        fn_part = (any(fn[1]<=x<=fn[2] for x in ev_file) if (fn and ev_file) else False)
    # diff
    if is_dir: hunk='dir'
    else:
        tag,hunks=DIFF[file]
        if len(hunks)==1 and hunks[0][0]==1 and hunks[0][1]>=len(SRC[file])-1: hunk='new file'
        else:
            inh=[h for h in hunks if h[0]<=s and e<=h[1]]
            if inh:
                tags=set(tag.get(x,'?') for x in range(s,e+1))
                hunk=f"hunk +{inh[0][0]}..{inh[0][1]} ({'added' if tags=={'+'} else 'CONTEXT lines' if tags=={' '} else 'mixed'})"
            else: hunk='OUTSIDE hunks'
    whole_file = bool(ev_file) and not ev_other and not nonline
    results.append(dict(ref=ref,row=row,file=file,s=s,e=e,sev=f['severity'],cat=f['category'],is_dir=is_dir,file_level=file_level,
        ev_file=ev_file,ev_other=ev_other,nonline=nonline,contain=contain,dist=dist,N=N,fn=fn,fn_cov=fn_cov,fn_part=(fn_part if not is_dir else None),hunk=hunk,
        cov_a=(contain=='yes'), cov_10=(N is not None and N<=10), cov_25=(N is not None and N<=25), cov_fn=bool(fn_cov),
        cov_file=bool(ev_file), full_file=whole_file))

json.dump(results,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'backcheck-269-results.json'),'w'),indent=1,default=str)

order=['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12','D13','D14','D15','D16','D17','D18','D19','D20']
print('\nTABLE  ref | row | cited | lvl | evidence-in-file | contain | dist | ±N | fn(span) fncov | hunk')
for row in order:
    for r in [x for x in results if x['row']==row]:
        cited=f"{r['file'].split('/')[-1]}:{r['s']}" + (f"–{r['e']}" if r['e'] and r['e']!=r['s'] else '') if not r['is_dir'] else r['file']+' (dir)'
        lvl='dir' if r['is_dir'] else ('file' if r['file_level'] else 'range')
        fn = f"{r['fn'][0]}({r['fn'][1]}–{r['fn'][2]})" if r['fn'] else 'none'
        fc = 'yes' if r['fn_cov'] else ('partly' if r['fn_part'] else 'no')
        print(f"{r['ref']:5} {row:4} {cited:28} {lvl:5} {r['contain']:8} dist={r['dist']} N={r['N']} fn={fn} fncov={fc} | {r['hunk']} | sev={r['sev']} cat={r['cat']}")

print('\nCOUNTS over 38 findings')
for k,lab in [('cov_a','(a) cited range alone'),('cov_10','(b) ±10'),('cov_25','(c) ±25'),('cov_fn','(d) enclosing function'),('cov_file','(e) whole cited file (line evidence in that file)'),('full_file','(e\') whole file AND no other-file/non-line evidence')]:
    print(f"  {lab}: {sum(1 for r in results if r[k])}/38")
print('COUNTS over 20 rows (any contributing finding)')
for k,lab in [('cov_a','(a)'),('cov_10','(b) ±10'),('cov_25','(c) ±25'),('cov_fn','(d) fn'),('cov_file','(e) file'),('full_file',"(e') file & complete")]:
    print(f"  {lab}: {sum(1 for row in order if any(r[k] for r in results if r['row']==row))}/20")
print('\nPER ROW best/worst N')
for row in order:
    rs=[r for r in results if r['row']==row]
    Ns=[r['N'] for r in rs if r['N'] is not None]
    print(f"  {row}: n={len(rs)} best N={min(Ns) if Ns else '—'} worst N={max(Ns) if Ns else '—'} fn-cov any={any(r['cov_fn'] for r in rs)} other-file={[k for k in EVID[row] if k not in set(r['file'] for r in rs)]} nonline={NONLINE.get(row)}")

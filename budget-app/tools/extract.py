import openpyxl,json,sys,warnings
warnings.filterwarnings('ignore')
wb=openpyxl.load_workbook(sys.argv[1],data_only=False)
num=lambda v:isinstance(v,(int,float)) and not isinstance(v,bool)
S=lambda v:str(v).strip() if v is not None else ''
out={}
# ---- עסק: ציור בחול
ws=wb['ציור בחול']
orders=[];exps=[];year='לפני החתונה'
for r in range(3,ws.max_row+1):
    if r>400: break
    a,b,c,d,e,f,g,h,i,j,k=[ws.cell(r,x).value for x in range(1,12)]
    if S(a)=='אירוע' and h: year=S(h)
    if S(a) and S(a)!='אירוע' and S(a)!='סה"כ' and num(b):
        orders.append(dict(client=S(a),amount=b,cost=c if num(c) else 0,when=S(d),note=S(e),year=year,paid=bool(g)))
    if S(j) and num(k) and '\\' not in S(j):
        exps.append(dict(item=S(j),amount=k,when=S(i),year=year))
out['orders']=orders;out['bizExpenses']=exps
# ---- חובות
ws=wb['חובות']
debts=[]
for r in range(7,23):
    n=ws.cell(r,2).value
    if n and S(n): debts.append(dict(name=S(n),kind='הלוואה',balance=ws.cell(r,3).value or 0,monthly=ws.cell(r,4).value or 0,left=ws.cell(r,5).value or 0,urgency=ws.cell(r,6).value or 0))
    n=ws.cell(r,9).value
    if n and S(n): debts.append(dict(name=S(n),kind=S(ws.cell(r,8).value),balance=ws.cell(r,10).value or 0,monthly=0,left=ws.cell(r,11).value or 0,urgency=ws.cell(r,12).value or 0))
out['debts']=debts
# ---- חודשי
ws=wb['תמונת מצב חודשית']
inc=[];fixed=[];var=[];cons=[];charity=[]
for r in range(7,34):
    d,e=ws.cell(r,4).value,ws.cell(r,5).value
    if d and S(d)!='.' : inc.append(dict(name=S(d),amount=e if num(e) else 0,day=ws.cell(r,3).value if num(ws.cell(r,3).value) else None))
    h,i=ws.cell(r,8).value,ws.cell(r,9).value
    if h and r<=29+1 and S(h): fixed.append(dict(name=S(h),amount=i if num(i) else 0))
    l,m=ws.cell(r,12).value,ws.cell(r,13).value
    if l and S(l):
        (charity if r>=25 else var).append(dict(name=S(l),amount=m if num(m) else 0))
    p,q=ws.cell(r,16).value,ws.cell(r,17).value
    if p and S(p) and r<=23: cons.append(dict(name=S(p),amount=q if num(q) else 0))
out['monthly']=dict(income=inc,fixed=fixed,variable=var,consumption=cons,charity=charity)
# ---- שנתי
ws=wb['תמונת מצב שנתית']
yinc=[];yexp=[];cur={'F':None,'J':None}
for r in range(7,75):
    c,dv=ws.cell(r,3).value,ws.cell(r,4).value
    if c and S(c) and not S(c).startswith(('חייבות','סה"כ','צדקה','חודש','חנוכה','ירידה','חול')) and r<=32: yinc.append(dict(name=S(c),amount=dv if num(dv) else 0))
    for mc,nc,ac in (('F','G','H'),('J','K','L')):
        mv=ws[f'{mc}{r}'].value
        if mv and S(mv): cur[mc]=S(mv).replace('כסלוי','כסלו')
        n,a=ws[f'{nc}{r}'].value,ws[f'{ac}{r}'].value
        if n and S(n) and cur[mc]: yexp.append(dict(month=cur[mc],name=S(n),amount=a if num(a) else 0))
    n,a=ws.cell(r,15).value,ws.cell(r,16).value
    if n and S(n) and r<=49: yexp.append(dict(month='כללי',name=S(n),amount=a if num(a) else 0))
out['yearIncome']=yinc;out['yearExpense']=yexp
json.dump(out,open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print({k:(len(v) if isinstance(v,list) else {kk:len(vv) for kk,vv in v.items()}) for k,v in out.items()})
import collections;print(collections.Counter(o['year'] for o in orders));print(collections.Counter(o['year'] for o in exps))

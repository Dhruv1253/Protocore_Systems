import React, { useEffect, useState } from 'react'
import logo from './assets/protocore-logo.jpeg'

const STORAGE_KEY = 'protocore_transactions_v1'
const NAMES_KEY = 'protocore_founders_v1'

export default function App() {
  const defaultFounders = ['Founder A','Founder B','Founder C']
  const [founders, setFounders] = useState(() => {
    try {
      const raw = localStorage.getItem(NAMES_KEY)
      return raw ? JSON.parse(raw) : defaultFounders
    } catch (e) { return defaultFounders }
  })
  const [transactions, setTransactions] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (e) { return [] }
  })
  const [form, setForm] = useState({ amount: '', payer: 0, description: '', date: new Date().toISOString().slice(0,10)})

  useEffect(()=>{ localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)) },[transactions])
  useEffect(()=>{ localStorage.setItem(NAMES_KEY, JSON.stringify(founders)) },[founders])

  function addTransaction(e){
    e.preventDefault()
    const amt = parseFloat(form.amount)
    if(Number.isNaN(amt) || amt<=0){ alert('Enter valid positive amount'); return }
    const newTx = { id: Date.now(), amount: Math.round(amt*100)/100, payer: Number(form.payer), description: form.description||'Raw material', date: form.date }
    setTransactions(t=>[newTx,...t])
    setForm(f=>({...f, amount:'', description:''}))
  }

  function removeTransaction(id){
    if(confirm('Delete this transaction?')) setTransactions(t=>t.filter(x=>x.id!==id))
  }

  const totals = founders.map((_, idx) => {
    const paid = transactions.filter(t=>t.payer===idx).reduce((s,x)=>s+x.amount,0)
    return { paid: Math.round(paid*100)/100 }
  })

  const totalExpense = Math.round(transactions.reduce((s,x)=>s+x.amount,0)*100)/100
  const fairShare = Math.round((totalExpense / founders.length)*100)/100
  const balances = totals.map(t=>Math.round((t.paid - fairShare)*100)/100)

  function computeSettlements(){
    const creditors = [], debtors=[]
    balances.forEach((bal, idx)=>{
      if(bal > 0.005) creditors.push({idx, amt: bal})
      else if(bal < -0.005) debtors.push({idx, amt: -bal})
    })
    const settlements = []
    let i=0, j=0
    while(i<debtors.length && j<creditors.length){
      const pay = Math.min(debtors[i].amt, creditors[j].amt)
      settlements.push({ from: debtors[i].idx, to: creditors[j].idx, amount: Math.round(pay*100)/100 })
      debtors[i].amt -= pay; creditors[j].amt -= pay
      if(Math.abs(debtors[i].amt) < 0.005) i++
      if(Math.abs(creditors[j].amt) < 0.005) j++
    }
    return settlements
  }

  const settlements = computeSettlements()

  function exportCSV(){
    const header = ['id','date','payer','amount','description'].join(',')
    const rows = transactions.slice().reverse().map(t=>[t.id,t.date,founders[t.payer],t.amount,`"${t.description}"`].join(','))
    const csv = [header,...rows].join('\n')
    const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `protocore_transactions_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  function clearAll(){ if(confirm('Clear ALL transactions? This cannot be undone.')) setTransactions([]) }

  return (
    <div className='min-h-screen p-6'>
      <div className='max-w-5xl mx-auto'>
        <header className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-3'>
            <img src={logo} alt='Protocore' className='h-14 w-14 object-contain rounded' />
            <div>
              <div className='text-lg font-bold uppercase'>PROTOCORE SYSTEMS</div>
              <div className='text-sm italic text-gray-600'>"Design Driven by Innovation."</div>
            </div>
          </div>
          <div className='text-right'>
            <div className='text-sm text-gray-500'>Protocore Finance Ledger</div>
            <div className='mt-2 flex gap-2'>
              <button className='px-3 py-1 border rounded' onClick={exportCSV}>Export CSV</button>
              <button className='px-3 py-1 border rounded' onClick={clearAll}>Clear All</button>
            </div>
          </div>
        </header>

        <section className='mb-6 bg-white p-4 rounded shadow-sm'>
          <h2 className='font-semibold mb-2'>Founders</h2>
          <div className='grid grid-cols-3 gap-3'>
            {founders.map((name,i)=>(
              <input key={i} value={name} onChange={(e)=>setFounders(f=>f.map((x,idx)=>idx===i?e.target.value:x))} className='border rounded p-2' placeholder={`Founder ${i+1}`} />
            ))}
          </div>
        </section>

        <div className='grid md:grid-cols-3 gap-4'>
          <form className='md:col-span-1 bg-white p-4 rounded shadow-sm' onSubmit={addTransaction}>
            <h2 className='font-semibold mb-3'>Add Raw-Material Expense</h2>
            <label className='block text-sm text-gray-700'>Amount (₹)</label>
            <input value={form.amount} onChange={(e)=>setForm(f=>({...f, amount: e.target.value}))} className='w-full border rounded p-2 mb-2' placeholder='e.g. 1500' />
            <label className='block text-sm text-gray-700'>Payer</label>
            <select value={form.payer} onChange={(e)=>setForm(f=>({...f, payer: Number(e.target.value)}))} className='w-full border rounded p-2 mb-2'>
              {founders.map((f,idx)=>(<option value={idx} key={idx}>{f}</option>))}
            </select>
            <label className='block text-sm text-gray-700'>Date</label>
            <input type='date' value={form.date} onChange={(e)=>setForm(f=>({...f, date: e.target.value}))} className='w-full border rounded p-2 mb-2' />
            <label className='block text-sm text-gray-700'>Description</label>
            <input value={form.description} onChange={(e)=>setForm(f=>({...f, description: e.target.value}))} className='w-full border rounded p-2 mb-4' placeholder='e.g. Purchase - Copper sheets' />
            <button className='w-full bg-indigo-600 text-white py-2 rounded'>Add Expense</button>
          </form>

          <section className='md:col-span-2 bg-white p-4 rounded shadow-sm'>
            <h2 className='font-semibold mb-3'>Summary</h2>
            <div className='grid grid-cols-3 gap-4 mb-4'>
              {founders.map((f,idx)=>(
                <div key={idx} className='border rounded p-3'>
                  <div className='text-sm text-gray-600'>{f}</div>
                  <div className='text-xl font-bold'>₹{(totals[idx].paid||0).toFixed(2)}</div>
                  <div className='text-xs text-gray-500'>Paid</div>
                  <div className='mt-2 text-sm'>Share: ₹{fairShare.toFixed(2)}</div>
                  <div className={`mt-1 font-medium ${balances[idx] >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {balances[idx] >= 0 ? `Receivable ₹${balances[idx].toFixed(2)}` : `Owes ₹${Math.abs(balances[idx]).toFixed(2)}`}
                  </div>
                </div>
              ))}
            </div>

            <div className='mb-4'>
              <div className='text-sm text-gray-600'>Total Expense</div>
              <div className='text-2xl font-bold'>₹{totalExpense.toFixed(2)}</div>
            </div>

            <div>
              <h3 className='font-semibold'>Suggested Settlements</h3>
              {settlements.length === 0 ? (
                <div className='text-sm text-gray-500'>No settlements needed — everyone is square.</div>
              ) : (
                <ul className='mt-2 space-y-2'>
                  {settlements.map((s,i)=>(
                    <li key={i} className='p-2 border rounded flex items-center justify-between'>
                      <div>
                        <div className='text-sm'><strong>{founders[s.from]}</strong> pays <strong>{founders[s.to]}</strong></div>
                        <div className='text-xs text-gray-500'>Amount: ₹{s.amount.toFixed(2)}</div>
                      </div>
                      <div>
                        <button onClick={()=>{ const t={ id: Date.now()+Math.random(), amount: Math.round(s.amount*100)/100, payer: s.from, description: `Settlement to ${founders[s.to]}`, date: new Date().toISOString().slice(0,10) }; setTransactions(x=>[t,...x]) }} className='px-3 py-1 border rounded text-sm'>Mark Paid</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className='mt-6 bg-white p-4 rounded shadow-sm'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='font-semibold'>Transactions</h2>
            <div className='text-sm text-gray-500'>{transactions.length} entries</div>
          </div>
          {transactions.length === 0 ? (
            <div className='text-gray-500 text-sm'>No transactions yet. Add your first raw-material expense.</div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-left border-collapse'>
                <thead>
                  <tr className='text-sm text-gray-600'>
                    <th className='p-2 border-b'>Date</th>
                    <th className='p-2 border-b'>Payer</th>
                    <th className='p-2 border-b'>Description</th>
                    <th className='p-2 border-b'>Amount (₹)</th>
                    <th className='p-2 border-b'>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t)=>(
                    <tr key={t.id} className='text-sm'>
                      <td className='p-2 border-b'>{t.date}</td>
                      <td className='p-2 border-b'>{founders[t.payer]}</td>
                      <td className='p-2 border-b'>{t.description}</td>
                      <td className='p-2 border-b'>₹{t.amount.toFixed(2)}</td>
                      <td className='p-2 border-b'>
                        <button className='mr-2 px-2 py-1 border rounded text-xs' onClick={()=>{
                          const edit = prompt('Edit description:', t.description)
                          if(edit !== null) setTransactions(cur=>cur.map(x=>x.id===t.id?{...x, description: edit}:x))
                        }}>Edit</button>
                        <button className='px-2 py-1 border rounded text-xs' onClick={()=>removeTransaction(t.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className='mt-6 text-center text-xs text-gray-500'>Protocore · Simple ledger • Data stored locally in your browser</footer>
      </div>
    </div>
  )
}

import Script from 'next/script';

export default function Home({ activityPage = false }: { activityPage?: boolean }) {
  return (
    <>
<div className="app" data-history-page={activityPage ? "true" : "false"}>
<aside className="sidebar">
<a className="brand" href="/">
<img className="brand-icon" src="/logo.png" alt="" width="40" height="40" />
<span>my money<span className="brand-dot">.</span>
</span>
</a>
<p className="side-label">YOUR SPACE</p>
<nav>
<a className={!activityPage ? "nav-active" : undefined} href="/">
<span>▦</span> Overview</a>
<a className={activityPage ? "nav-active" : undefined} href="/activity">
<span>◷</span> Transactions</a>
</nav>
<div className="side-bottom">
<div className="side-note">
<span>✦</span>
<strong>Little steps,<br />big progress.</strong>
<p>Every entry brings you closer to your goals.</p>
</div>
<div id="account">
<button className="account-button" id="signIn">↗ &nbsp; Sign in to sync</button>
</div>
</div>
</aside>
<main>
<header>
<div className="mobile-brand">
<img className="brand-icon" src="/logo.png" alt="" width="40" height="40" /> my money<span className="brand-dot">.</span>
</div>
<div className="header-right">
<span className="sync-status" id="syncStatus">
<i>
</i> Checking connection</span>
<button className="avatar" id="accountShortcut" aria-label="Account">☺</button>
</div>
</header>
<div className="content" id="overview">
<div hidden={activityPage}>
<section className="intro">
<div>
<p className="eyebrow">YOUR MONEY, MADE SIMPLE <span>✳</span>
</p>
<h1>Good to see you<span className="accent">.</span>
</h1>
<p className="subtitle">A little clarity goes a long way. Let’s make today count.</p>
</div>
<button className="primary desktop-add" data-open="">
<span>＋</span> Add transaction</button>
</section>
<div className="money-shortcuts" aria-label="Money shortcuts">
<button type="button" data-new-wallet=""><span aria-hidden="true">＋</span><span><strong>Add account</strong><small>Bank, mobile money or cash</small></span></button>
<button type="button" data-import-messages=""><span aria-hidden="true">↙</span><span><strong>Paste a message</strong><small>Review it, then save</small></span></button>
</div>
<div id="settingsReminder" className="settings-reminder" hidden><div><strong>Make your money feel local</strong><p>Set your country and currency so amounts are shown correctly.</p></div><button type="button" id="reminderSettings">Set country &amp; currency</button></div>
<section className="balance-card">
<div className="balance-copy">
<div className="balance-top">
<span className="balance-label">TOTAL MONEY AVAILABLE</span>
<span className="sparkle">✳</span>
</div>
<h2 id="balance">$0.00</h2>
<p>Everything you have, all in one place.</p>
<div className="balance-footer">
<span className="live-dot">
</span> Your money at a glance</div>
</div>
<div className="balance-art" aria-hidden="true">
<div className="orbit orbit-one">
</div>
<div className="orbit orbit-two">
</div>
<div className="coin coin-one">✳</div>
<div className="coin coin-two">$</div>
<span className="art-star">✦</span>
</div>
</section>
<section className="stats">
<article className="stat">
<div className="stat-icon income-icon">↙</div>
<div>
<p>Money in</p>
<strong id="income">$0.00</strong>
<small>All income</small>
</div>
<span className="stat-arrow">↗</span>
</article>
<article className="stat">
<div className="stat-icon expense-icon">↗</div>
<div>
<p>Money out</p>
<strong id="expenses">$0.00</strong>
<small>All expenses</small>
</div>
<span className="stat-arrow">↗</span>
</article>
<article className="stat habit">
<div className="stat-icon habit-icon">✦</div>
<div>
<p> Your progress</p>
<strong id="entryCount">0 entries</strong>
<small>Every one counts</small>
</div>
<span className="stat-arrow">↗</span>
</article>
</section>
</div>
<div id="financePanel"></div>
<section className="activity" id="activity">
<div className="section-heading">
<div>
<p className="eyebrow">THE LITTLE DETAILS</p>
<h3>{activityPage ? "All activity" : "Recent activity"} <span>✳</span>
</h3>
<p>Your money story, one entry at a time.</p>
</div>
{activityPage && <button className="primary desktop-add activity-add" data-open="">+ Add transaction</button>}
<div className="filters" aria-label="Filter transactions">
<button className="filter active" data-filter="all">All</button>
<button className="filter" data-filter="income">Money In</button>
<button className="filter" data-filter="expense">Money Out</button><button className="filter" data-filter="transfer">Move Money</button><button className="filter" data-filter="review">Needs Review</button>
</div>
</div>
<div className="history-tools" hidden={!activityPage}><label className="search-field"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg><span className="sr-only">Search transactions</span><input id="transactionSearch" type="search" placeholder="Search description or category" /></label><p id="resultsCount" aria-live="polite"></p></div>
<div id="transactions">
</div>
<div className="pagination" id="pagination" aria-label="Transaction pages"></div>
{!activityPage && <a className="view-activity" href="/activity">View all activity <span aria-hidden="true">&rarr;</span></a>}
</section>
<div className="bottom-note">
<span>✳</span> Small entries. Big picture. <span>Made for your accountability.</span>
</div>
</div>
</main>
<nav className="mobile-nav" aria-label="Main navigation">
<a href="/" aria-current={!activityPage ? "page" : undefined}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></svg>Overview</a>
<button data-open="" className="mobile-add"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></span>Add</button>
<a href="/activity" aria-current={activityPage ? "page" : undefined}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>Activity</a>
</nav>
</div>
<dialog id="accountDialog" aria-labelledby="accountTitle">
<div className="account-panel">
<div className="modal-head"><div><p className="eyebrow">YOUR SPACE</p><h3 id="accountTitle">Your account<span className="accent">.</span></h3></div><button type="button" className="close" id="closeAccount" aria-label="Close account">&times;</button></div>
<div className="account-identity"><div className="account-avatar" id="accountInitial" aria-hidden="true">?</div><div><strong id="accountName">Your account</strong><p id="accountEmail"></p></div></div>
<div className="account-connection"><span className="account-connection-dot" aria-hidden="true"></span><div><strong id="accountStatus">Checking connection</strong><p id="accountStatusDetail"></p></div></div>
<div className="account-actions"><button type="button" id="accountSignIn" hidden><span><strong>Sign in to sync</strong><small>Access your account across devices</small></span><span aria-hidden="true">&#8599;</span></button><button type="button" id="accountProfile"><span><strong>Manage account</strong><small>Profile, security and active sessions</small></span><span aria-hidden="true">&#8599;</span></button><button type="button" id="accountInstall"><span><strong>Install My Money</strong><small>Add the app to your device</small></span><span aria-hidden="true">&#8595;</span></button><p id="installHelp" className="install-help" role="status" hidden></p><button type="button" id="accountSettings"><span><strong>Money settings</strong><small>Country and currency</small></span><span aria-hidden="true">&#8250;</span></button><button type="button" id="accountSignOut" className="account-sign-out">Sign out</button></div>
</div>
</dialog>
<dialog id="entryDialog">
<form id="entryForm">
<div className="modal-head">
<div>
<p className="eyebrow">ONE LITTLE STEP</p>
<h3 id="dialogTitle">Add a transaction<span className="accent">.</span>
</h3>
</div>
<button type="button" className="close" id="closeDialog" aria-label="Close">×</button>
</div>
<p className="modal-sub">Keep track of the little things. They add up.</p>
<div className="type-picker"><label><input type="radio" name="type" value="transfer"/><span>Move Money</span></label>
<label>
<input type="radio" name="type" value="expense" defaultChecked />
<span>↗ &nbsp; Money Out</span>
</label>
<label>
<input type="radio" name="type" value="income" />
<span>↙ &nbsp; Money In</span>
</label>
</div>
<div id="entryAccounts"></div><label className="field">Amount <div className="amount-input">
<span id="amountCurrency">USD</span>
<input name="amount" type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" placeholder="0.00" required />
</div>
</label>
<label className="field">What was it for?<input name="description" maxLength={100} placeholder="Optional description" />
</label>
<div>
<label className="field">Category<select name="category">
<option value="">Needs Review</option><option>Food & drink</option>
<option>Shopping</option>
<option>Transport</option>
<option>Bills</option>
<option>Health</option>
<option>Entertainment</option>
<option>Tithes</option>
<option>Offerings</option>
<option>Giving &amp; donations</option>
<option>Housing &amp; rent</option>
<option>Groceries</option>
<option>Utilities</option>
<option>Education</option>
<option>Family &amp; childcare</option>
<option>Insurance</option>
<option>Personal care</option>
<option>Travel</option>
<option>Subscriptions</option>
<option>Debt payments</option>
<option>Savings &amp; investments</option>
<option>Gifts</option>
<option>Business</option>
<option>Freelance</option>
<option>Interest &amp; dividends</option>
<option>Salary</option>
<option>Other</option>
</select>
</label>
</div>
<div className="form-row">
<label className="field">Date<input name="date" type="date" required /></label>
<label className="field">Time <span className="optional">(optional)</span><input name="time" type="time" aria-describedby="timeHint" /></label>
</div>
<p id="timeHint" className="field-help">New entries use the current time if left blank.</p>
<div id="entryExtras"></div>
<button className="primary save" type="submit">Save transaction <span>→</span>
</button>
<button className="save-another" type="submit" name="saveAnother" value="yes">Save and add another</button>
<p className="form-hint">✦ &nbsp; Saved on this device, even when you’re offline.</p>
</form>
</dialog>
<dialog id="setupDialog" aria-labelledby="setupTitle">
<form id="setupForm">
<div className="modal-head"><div><p className="eyebrow">MAKE IT YOURS</p><h3 id="setupTitle">Set up your money</h3></div><button type="button" className="close" id="closeSetup" aria-label="Close setup">&times;</button></div>
<p className="modal-sub">Choose your country and the currency you use to record transactions.</p>
<div className="field">Country<details className="choice-picker" id="countryPicker"><summary id="countrySummary">Select your country</summary><div className="choice-menu"><label className="sr-only" htmlFor="countrySearch">Search countries</label><input id="countrySearch" type="search" placeholder="Search by country or code" autoComplete="off" /><select name="country" id="countrySelect" size={6} aria-label="Country"><option value="">Select your country</option></select></div></details></div>
<div className="field">Currency<details className="choice-picker" id="currencyPicker"><summary id="currencySummary">Select your currency</summary><div className="choice-menu"><label className="sr-only" htmlFor="currencySearch">Search currencies</label><input id="currencySearch" type="search" placeholder="Search by currency or code" autoComplete="off" /><select name="currency" id="currencySelect" size={6} aria-label="Currency"><option value="">Select your currency</option></select></div></details></div>
<p className="setup-note">Amounts use two decimal places. Changing currency later changes the label; it does not convert existing amounts.</p>
<p id="setupError" className="setup-error" role="alert"></p>
<button className="primary save" type="submit">Save settings</button>
</form>
</dialog>
<dialog id="detailDialog" aria-labelledby="detailTitle"><div className="modal-head"><div><p className="eyebrow">TRANSACTION DETAILS</p><h3 id="detailTitle">Transaction</h3></div><button type="button" className="close" id="closeDetail" aria-label="Close details">&times;</button></div><div id="detailContent"></div><div className="detail-actions"><button type="button" className="primary" id="detailEdit">Edit transaction</button><button type="button" className="detail-delete" id="detailDelete">Delete</button></div></dialog>
<div id="toast" role="status">
</div>
<Script src="/app.js" type="module" strategy="afterInteractive" />
    </>
  );
}

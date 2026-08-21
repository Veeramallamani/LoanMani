// Loan Default Risk & 2026 Indian Bank Underwriting Policy Engine

const BANK_UNDERWRITING_POLICIES_2026 = {
  general: {
    name: 'General RBI Lending Benchmark',
    category: 'Regulatory Baseline',
    minAge: 18,
    maxAge: 70,
    maxFoir: 0.50,
    minIncomeSalaried: 15000,
    minIncomeSelfEmployed: 20000,
    summary: 'Standard multi-bank prudential lending norms (FOIR ≤ 50%, Age 18–70, CIBIL ≥ 650).'
  },
  sbi: {
    name: 'State Bank of India (SBI)',
    category: 'Public Sector Bank',
    minAge: 18,
    maxAge: 70,
    maxFoir: 0.50,
    minIncomeSalaried: 15000,
    minIncomeSelfEmployed: 20000,
    goldLoanMaxLimit: 5000000, // ₹50L
    goldLoanMinLimit: 20000,
    eduMaxTenure: 180,
    summary: 'SBI 2026: Age 18–70, Tenure up to 30 yrs, YONO digital flow, Gold ₹20k–₹50L, Education up to 15 yrs.'
  },
  hdfc: {
    name: 'HDFC Bank',
    category: 'Private Sector Bank',
    minAge: 21,
    maxAge: 65,
    maxFoir: 0.50,
    minIncomeSalariedHome: 25000,
    minAnnualIncomeCar: 300000, // ₹3L/yr
    minCarAge: 21,
    maxCarAgeMaturity: 60,
    summary: 'HDFC 2026: Age 21–65, Car Loan min ₹3L annual salary (Age 21–60), Gold 18–75, Education 16–35.'
  },
  icici: {
    name: 'ICICI Bank',
    category: 'Private Sector Bank',
    minAge: 21,
    maxAge: 70,
    maxFoir: 0.50,
    minIncomeSalaried: 25000,  // ₹25,000/mo
    minIncomeSelfEmployed: 30000, // ₹30,000/mo
    summary: 'ICICI 2026: Salaried min ₹25,000/mo, Self-employed min ₹30,000/mo, Age 21–70, Pre-admission education sanction.'
  },
  axis: {
    name: 'Axis Bank',
    category: 'Private Sector Bank',
    minAge: 21,
    maxAge: 65,
    maxFoir: 0.50,
    minAnnualSalaryCar: 240000, // ₹2.40L/yr
    minAnnualBusinessCar: 180000, // ₹1.80L/yr
    summary: 'Axis 2026: Car Loan net salary ≥ ₹2.40L/yr (1 yr exp) or ₹1.80L business (3 yrs vintage), Home Loan up to 30 yrs.'
  },
  bob_pnb: {
    name: 'Bank of Baroda / PNB',
    category: 'Public Sector Bank',
    minAge: 21,
    maxAge: 70,
    maxFoir: 0.50,
    minIncomeSalaried: 20000,
    minIncomeSelfEmployed: 25000,
    summary: 'BoB / PNB 2026: Public sector retail housing/auto schemes, 30-year home tenure, strict credit gate.'
  },
  cosmos: {
    name: 'Cosmos Co-operative Bank',
    category: 'Urban Cooperative Bank (UCB)',
    minAge: 21,
    maxAge: 70,
    maxFoir: 0.55,
    homeLoanMaxLimit: 30000000, // ₹3 Crore
    carLoanLtv: 90, // 90% on-road
    twoWheelerMaxLimit: 1000000, // ₹10 Lakh
    goldLoanLtv: 70,
    summary: 'Cosmos UCB 2026: Home Loan up to ₹3 Crore, Car Loan up to 90% on-road value, Two-wheeler up to ₹10L, Gold 70% LTV.'
  },
  saraswat: {
    name: 'Saraswat Co-operative Bank',
    category: 'Urban Cooperative Bank (UCB)',
    minAge: 18,
    maxAge: 70,
    maxFoir: 0.50,
    microfinanceHouseholdMax: 300000, // ₹3 Lakh
    summary: 'Saraswat UCB 2026: Microfinance/consumer credit up to ₹3L household income, society-flat owner fee concessions.'
  }
};

class LoanEvaluator {
  static evaluateLoanApplication(input) {
    const applicantIncome = parseFloat(input.ApplicantIncome) || 0;
    const coapplicantIncome = parseFloat(input.CoapplicantIncome) || 0;
    const loanAmount = parseFloat(input.LoanAmount) || 100;
    const loanTerm = parseFloat(input.Loan_Amount_Term) || 360;
    const creditHistory = parseInt(input.Credit_History) === 1 ? 1 : 0;
    const gender = input.Gender || 'Male';
    const married = input.Married || 'No';
    const dependents = input.Dependents || '0';
    const education = input.Education || 'Graduate';
    const selfEmployed = input.Self_Employed || 'No';
    const propertyArea = input.Property_Area || 'Semiurban';
    const applicantAge = parseInt(input.ApplicantAge) || 32;
    const targetBank = input.TargetBank || 'general';
    const loanProduct = input.LoanProduct || 'Home';

    // 1. Feature Engineering
    const totalIncome = applicantIncome + coapplicantIncome;
    const emi = (loanAmount * 1000) / (loanTerm || 1);
    const emiToIncomeRatio = totalIncome > 0 ? emi / totalIncome : 1.0;
    const loanToIncomeRatio = totalIncome > 0 ? (loanAmount * 1000) / totalIncome : 100.0;

    // Categories
    let incomeCategory = 'Low';
    if (totalIncome >= 10000) incomeCategory = 'Very High';
    else if (totalIncome >= 6000) incomeCategory = 'High';
    else if (totalIncome >= 3000) incomeCategory = 'Medium';

    let loanCategory = 'Small';
    if (loanAmount >= 350) loanCategory = 'Very Large';
    else if (loanAmount >= 200) loanCategory = 'Large';
    else if (loanAmount >= 100) loanCategory = 'Medium';

    // 2. Map for model prediction
    const dependentsNum = parseInt(dependents.replace('+', '')) || 0;
    const featureMap = {
      ApplicantIncome: applicantIncome,
      CoapplicantIncome: coapplicantIncome,
      LoanAmount: loanAmount,
      Loan_Amount_Term: loanTerm,
      Credit_History: creditHistory,
      TotalIncome: totalIncome,
      EMI_to_Income_Ratio: emiToIncomeRatio,
      Loan_to_Income_Ratio: loanToIncomeRatio,
      Gender_Male: gender === 'Male' ? 1 : 0,
      Married_Yes: married === 'Yes' ? 1 : 0,
      Education_Graduate: education === 'Graduate' ? 1 : 0,
      Self_Employed_Yes: selfEmployed === 'Yes' ? 1 : 0,
      Dependents_Num: dependentsNum,
      Property_Rural: propertyArea === 'Rural' ? 1 : 0,
      Property_Semiurban: propertyArea === 'Semiurban' ? 1 : 0,
      Property_Urban: propertyArea === 'Urban' ? 1 : 0
    };

    // 3. Compute Logistic Regression score
    let z = LOGISTIC_INTERCEPT || -1.2;
    const factorImpacts = [];

    for (const key in featureMap) {
      if (SCALER_MEANS[key] !== undefined && SCALER_SCALES[key] !== undefined) {
        const mean = SCALER_MEANS[key];
        const scale = SCALER_SCALES[key] || 1;
        const coef = LOGISTIC_COEFFICIENTS[key] || 0;
        const scaledVal = (featureMap[key] - mean) / scale;
        const impact = scaledVal * coef;
        z += impact;

        factorImpacts.push({
          feature: key,
          rawVal: featureMap[key],
          scaledVal: scaledVal,
          coef: coef,
          impact: impact
        });
      }
    }

    const defaultProb = 1 / (1 + Math.exp(-z));
    const defaultProbPct = Math.round(defaultProb * 1000) / 10; // e.g. 18.5%

    // Risk Classification & Decision
    let riskTier = 'Low Risk';
    let decision = 'APPROVE';
    let decisionBadgeClass = 'badge-approve';
    let recommendation = 'Low default risk. Recommended for immediate approval with standard terms.';

    if (defaultProbPct >= 65.0) {
      riskTier = 'Severe Risk';
      decision = 'REJECT';
      decisionBadgeClass = 'badge-decline';
      recommendation = 'High probability of default. Underwriting guidelines suggest decline or requiring substantial collateral / guarantor.';
    } else if (defaultProbPct >= 35.0) {
      riskTier = 'High Risk';
      decision = 'MANUAL REVIEW';
      decisionBadgeClass = 'badge-review';
      recommendation = 'Elevated risk profile. Escalation to senior underwriter recommended for manual review & secondary verification.';
    } else if (defaultProbPct >= 18.0) {
      riskTier = 'Moderate Risk';
      decision = 'APPROVE WITH CONDITIONS';
      decisionBadgeClass = 'badge-conditional';
      recommendation = 'Acceptable risk. Recommended for approval subject to standard income verification and LTV verification.';
    }

    // Top drivers
    factorImpacts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    const topRiskDrivers = factorImpacts.filter(f => f.impact > 0).slice(0, 3);
    const topPositiveFactors = factorImpacts.filter(f => f.impact < 0).slice(0, 3);

    // 4. Bank Policy Underwriting Verification (2026 Framework)
    const bankPolicy = BANK_UNDERWRITING_POLICIES_2026[targetBank] || BANK_UNDERWRITING_POLICIES_2026.general;
    const complianceChecks = [];
    let hardGatePassed = true;

    // Check A: Age Criteria
    let minAge = bankPolicy.minAge || 18;
    let maxAge = bankPolicy.maxAge || 70;
    if (targetBank === 'hdfc' && loanProduct === 'Car') {
      maxAge = 60;
    }
    const agePassed = applicantAge >= minAge && applicantAge <= maxAge;
    if (!agePassed) hardGatePassed = false;
    complianceChecks.push({
      label: 'Age Eligibility',
      applicantVal: `${applicantAge} Yrs`,
      ruleVal: `${minAge}–${maxAge} Yrs`,
      status: agePassed ? 'pass' : 'fail',
      note: agePassed ? 'Within eligible age bracket' : `Outside ${bankPolicy.name} age limits (${minAge}–${maxAge})`
    });

    // Check B: Income Cutoff
    let reqMonthlyIncome = selfEmployed === 'Yes' 
      ? (bankPolicy.minIncomeSelfEmployed || 20000) 
      : (bankPolicy.minIncomeSalaried || 15000);
    
    if (targetBank === 'icici' && loanProduct === 'Home') {
      reqMonthlyIncome = selfEmployed === 'Yes' ? 30000 : 25000;
    } else if (targetBank === 'hdfc' && loanProduct === 'Car') {
      reqMonthlyIncome = 25000; // ₹3 Lakhs/year
    } else if (targetBank === 'axis' && loanProduct === 'Car') {
      reqMonthlyIncome = selfEmployed === 'Yes' ? 15000 : 20000; // ₹1.8L - ₹2.4L / yr
    }

    const incomePassed = applicantIncome >= reqMonthlyIncome;
    if (!incomePassed) hardGatePassed = false;
    complianceChecks.push({
      label: 'Minimum Income Gate',
      applicantVal: `₹${applicantIncome.toLocaleString('en-IN')}/mo`,
      ruleVal: `≥ ₹${reqMonthlyIncome.toLocaleString('en-IN')}/mo`,
      status: incomePassed ? 'pass' : 'fail',
      note: incomePassed ? 'Meets minimum income threshold' : `Below ${bankPolicy.name} minimum requirement (₹${reqMonthlyIncome.toLocaleString('en-IN')})`
    });

    // Check C: FOIR / EMI Burden
    const maxFoir = bankPolicy.maxFoir || 0.50;
    const foirPassed = emiToIncomeRatio <= maxFoir;
    if (!foirPassed) hardGatePassed = false;
    complianceChecks.push({
      label: 'FOIR / EMI Burden',
      applicantVal: `${(emiToIncomeRatio * 100).toFixed(1)}%`,
      ruleVal: `≤ ${(maxFoir * 100).toFixed(0)}% of Income`,
      status: foirPassed ? 'pass' : 'fail',
      note: foirPassed ? 'EMI is comfortably within repayment capacity' : `Exceeds max allowable FOIR cap of ${(maxFoir * 100).toFixed(0)}%`
    });

    // Check D: Credit History (CIBIL / Repayment Flag)
    const creditPassed = creditHistory === 1;
    if (!creditPassed) hardGatePassed = false;
    complianceChecks.push({
      label: 'Credit History Gate',
      applicantVal: creditHistory === 1 ? 'Clear (1.0)' : 'Adverse / Missing (0.0)',
      ruleVal: '1.0 (Satisfactory Record)',
      status: creditPassed ? 'pass' : 'fail',
      note: creditPassed ? 'Clean credit track record' : 'Adverse credit history (Automated bank sanction blocked)'
    });

    // Check E: Loan Sizing & Product Limits
    let productRulePassed = true;
    let productRuleText = 'Standard product guidelines met';
    if (loanProduct === 'Gold' && loanAmount > 5000 && targetBank === 'sbi') {
      productRulePassed = false;
      productRuleText = 'Exceeds SBI Personal Gold Loan limit of ₹50 Lakh';
    } else if (targetBank === 'cosmos' && loanProduct === 'Home' && loanAmount > 30000) {
      productRulePassed = false;
      productRuleText = 'Exceeds Cosmos Bank maximum home loan limit of ₹3 Crore';
    }
    if (!productRulePassed) hardGatePassed = false;
    complianceChecks.push({
      label: 'Product Sizing & Terms',
      applicantVal: `₹${(loanAmount * 1000).toLocaleString('en-IN')}`,
      ruleVal: loanProduct === 'Gold' ? 'Max 75% LTV / Cap' : 'Within Bank Cap',
      status: productRulePassed ? 'pass' : 'fail',
      note: productRuleText
    });

    // Integrated Final Decision
    let bankVerdictDecision = decision;
    let bankVerdictBadgeClass = decisionBadgeClass;
    let bankRecommendation = recommendation;

    if (!hardGatePassed) {
      bankVerdictDecision = 'BANK POLICY DECLINE';
      bankVerdictBadgeClass = 'badge-decline';
      bankRecommendation = `Application fails ${bankPolicy.name} underwriting criteria (${complianceChecks.filter(c => c.status === 'fail').map(c => c.label).join(', ')}). Senior credit override or co-applicant required.`;
    } else if (decision === 'APPROVE') {
      bankVerdictDecision = `ELIGIBLE (${bankPolicy.name.split(' ')[0]})`;
      bankVerdictBadgeClass = 'badge-approve';
      bankRecommendation = `Meets all 2026 ${bankPolicy.name} criteria with low default probability (${defaultProbPct}%). Recommended for standard processing.`;
    }

    return {
      engineered: {
        totalIncome,
        emi: Math.round(emi),
        emiToIncomeRatio: Math.round(emiToIncomeRatio * 1000) / 1000,
        loanToIncomeRatio: Math.round(loanToIncomeRatio * 100) / 100,
        incomeCategory,
        loanCategory
      },
      assessment: {
        defaultProbabilityPct: defaultProbPct,
        approvalProbabilityPct: Math.round((100 - defaultProbPct) * 10) / 10,
        riskTier,
        decision: bankVerdictDecision,
        decisionBadgeClass: bankVerdictBadgeClass,
        recommendation: bankRecommendation,
        mlDecision: decision,
        mlBadgeClass: decisionBadgeClass
      },
      bankUnderwriting: {
        policy: bankPolicy,
        hardGatePassed,
        complianceChecks,
        targetBank,
        loanProduct
      },
      factors: {
        all: factorImpacts,
        topRiskDrivers,
        topPositiveFactors
      }
    };
  }
}

// Global Export
window.BANK_UNDERWRITING_POLICIES_2026 = BANK_UNDERWRITING_POLICIES_2026;
window.LoanEvaluator = LoanEvaluator;


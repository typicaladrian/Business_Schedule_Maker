from ortools.sat.python import cp_model
from app.models import ScheduleRequestPayload, Skill
import random

def generate_schedule(payload: ScheduleRequestPayload):
    print("DEBUG 1: Initializing model...")
    model = cp_model.CpModel()

    employees = payload.employees
    
    # Helper to get the requirement for a specific employee's location on a given day
    def get_req_for_emp_day(emp, day):
        for req in payload.daily_requirements:
            if req.day_of_week == day and req.location == emp.home_location:
                return req
        return None

    # Get unique days in order
    unique_days = []
    for req in payload.daily_requirements:
        if req.day_of_week not in unique_days:
            unique_days.append(req.day_of_week)

    print("DEBUG 2: Creating Shift Boolean variables...")
    works = {}       # Key: (emp.id, day, shift.id) - True if working this specific shift
    worked_day = {}  # Key: (emp.id, day) - True if working AT ALL this day

    for emp in employees:
        for day in unique_days:
            req = get_req_for_emp_day(emp, day)
            if not req:
                continue
            
            day_shifts = []
            for shift in req.allowed_shifts:
                var = model.NewBoolVar(f'work_{emp.name}_{day}_{shift.id}')
                works[(emp.id, day, shift.id)] = var
                day_shifts.append(var)
            
            # CONSTRAINT: An employee can work AT MOST ONE shift per day
            model.AddAtMostOne(day_shifts)
            
            # Create a summary variable for the day (1 if they work any shift, 0 if off)
            worked_var = model.NewBoolVar(f'worked_{emp.name}_{day}')
            model.Add(worked_var == sum(day_shifts))
            worked_day[(emp.id, day)] = worked_var

    print("DEBUG 3: Adding Employee-level constraints (Days, Minutes)...")
    for emp in employees:
        # 1. Max Days per week
        model.Add(sum(worked_day[(emp.id, day)] for day in unique_days) <= emp.max_days_per_week)
        
        # 2. Min/Max Weekly Hours (Converted to Minutes)
        total_minutes = []
        for day in unique_days:
            req = get_req_for_emp_day(emp, day)
            if req:
                for shift in req.allowed_shifts:
                    total_minutes.append(works[(emp.id, day, shift.id)] * shift.paid_minutes)
        
        model.Add(sum(total_minutes) <= int(emp.max_hours_per_week * 60))
        model.Add(sum(total_minutes) >= int(emp.min_hours_per_week * 60))

        # 3. Required / Unavailable Days
        for req_day in emp.required_work_days:
            if req_day in unique_days:
                model.Add(worked_day[(emp.id, req_day)] == 1)
                
        for unavail_day in emp.unavailable_days:
            if unavail_day in unique_days:
                model.Add(worked_day[(emp.id, unavail_day)] == 0)

        # 4. NEW: Dynamic Consecutive Openings Limit (Iterative Relaxation)
        if len(unique_days) > payload.max_consecutive_openings:
            # Create rolling windows (e.g., Mon-Tue-Wed, then Tue-Wed-Thu)
            for start_day_idx in range(len(unique_days) - payload.max_consecutive_openings):
                rolling_window = []
                
                # Gather all opening shifts for this specific block of days
                for offset in range(payload.max_consecutive_openings + 1):
                    day = unique_days[start_day_idx + offset]
                    req = get_req_for_emp_day(emp, day)
                    if req:
                        for shift in req.allowed_shifts:
                            if getattr(shift, 'is_opening_shift', False):
                                rolling_window.append(works[(emp.id, day, shift.id)])
                
                # MATH ENGINE STRICT LIMIT: You cannot open every day in this window!
                if rolling_window:
                    model.Add(sum(rolling_window) <= payload.max_consecutive_openings)

    print("DEBUG 4: Adding Location & Skill constraints...")
    for req in payload.daily_requirements:
        day = req.day_of_week
        loc = req.location
        available_staff = [emp for emp in employees if emp.home_location == loc]
        
        # 1. Base Headcount
        model.Add(sum(worked_day[(emp.id, day)] for emp in available_staff) >= req.min_headcount)
        
        # 2. Vault Presence (Anytime during the day)
        vault_staff = [emp for emp in available_staff if Skill.VAULT in emp.skills]
        model.Add(sum(worked_day[(emp.id, day)] for emp in vault_staff) >= req.requires_vault)

        # 3. Openers (Combo A & B MUST be assigned to a shift where is_opening_shift == True)
        opening_shifts = [shift for shift in req.allowed_shifts if shift.is_opening_shift]
        
        # Combo A Opener
        combo_a_staff = [emp for emp in available_staff if Skill.COMBO_A in emp.skills]
        combo_a_openers = []
        for emp in combo_a_staff:
            for shift in opening_shifts:
                combo_a_openers.append(works[(emp.id, day, shift.id)])
        model.Add(sum(combo_a_openers) >= req.requires_combo_a_open)

        # Combo B Opener
        combo_b_staff = [emp for emp in available_staff if Skill.COMBO_B in emp.skills]
        combo_b_openers = []
        for emp in combo_b_staff:
            for shift in opening_shifts:
                combo_b_openers.append(works[(emp.id, day, shift.id)])
        model.Add(sum(combo_b_openers) >= req.requires_combo_b_open)

        # ATM Opener
        atm_staff = [emp for emp in available_staff if Skill.ATM in emp.skills]
        atm_openers = []
        for emp in atm_staff:
            for shift in opening_shifts:
                atm_openers.append(works[(emp.id, day, shift.id)])
        model.Add(sum(atm_openers) >= req.requires_atm_open)

        # Closing Procedure Constraint
        closing_shifts = [shift for shift in req.allowed_shifts if getattr(shift, 'is_closing_shift', False)]
        
        if closing_shifts:
            closing_staff = []
            for emp in available_staff:
                for shift in closing_shifts:
                    closing_staff.append(works[(emp.id, day, shift.id)])
            
            # MATH ENGINE STRICT LIMIT: The number of closers must be >= (Minimum Daily Headcount - 1)
            model.Add(sum(closing_staff) >= (req.min_headcount - 1))

        # AI Custom Cap on Openers
        if req.max_openers is not None:
            all_openers_on_day = []
            for emp in available_staff:
                for shift in opening_shifts:
                    all_openers_on_day.append(works[(emp.id, day, shift.id)])
            
            # MATH ENGINE STRICT LIMIT: The sum of all people working opening shifts cannot exceed the cap.
            model.Add(sum(all_openers_on_day) <= req.max_openers)

    print("DEBUG 4.5: Adding Random Lottery Objective for Fair Distribution...")
    objective_terms = []
    
    for emp in employees:
        for day in unique_days:
            req = get_req_for_emp_day(emp, day)
            if req:
                for shift in req.allowed_shifts:
                    # We only care about randomizing the Openers right now
                    if getattr(shift, 'is_opening_shift', False):
                        # Assign a random score (1 to 100) to this specific person on this specific day
                        random_weight = random.randint(1, 100)
                        objective_terms.append(works[(emp.id, day, shift.id)] * random_weight)
    
    # MATH ENGINE OBJECTIVE: Try to get the highest random score possible!
    if objective_terms:
        model.Maximize(sum(objective_terms))

    print("DEBUG 5: Launching the C++ Solver...")
    solver = cp_model.CpSolver()
    
    # We give the solver a 10-second limit so it doesn't hang forever if the math is impossible
    solver.parameters.max_time_in_seconds = 10.0 
    status = solver.Solve(model)
    
    print(f"DEBUG 6: Solver finished with status code: {status}")
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        print("\n✅ Advanced Schedule Found!")
        
        # Build a structured dictionary to return
        schedule_result = {}
        for day in unique_days:
            schedule_result[day] = []
            for req in payload.daily_requirements:
                if req.day_of_week == day:
                    for emp in [e for e in employees if e.home_location == req.location]:
                        for shift in req.allowed_shifts:
                            if solver.Value(works[(emp.id, day, shift.id)]):
                                schedule_result[day].append({
                                    "employee_id": emp.id,
                                    "employee_name": emp.name,
                                    "location": emp.home_location.value,
                                    "start_time": shift.start_time,
                                    "end_time": shift.end_time,
                                    "paid_hours": round(shift.paid_minutes / 60, 2),
                                    "is_opening": getattr(shift, 'is_opening_shift', False)
                                })
        return {"status": "success", "schedule": schedule_result}
    else:   
        print("❌ No feasible schedule could be found.")
        return {"status": "error", "message": "Infeasible constraints."}
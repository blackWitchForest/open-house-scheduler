
// --- State ---
let labs = [];
let selectedLabs = [];
let studentAvailability = [];

// --- DOM Elements ---
const labsContainer = document.getElementById('labs-container');
const scheduleContainer = document.getElementById('schedule-container');
const generateScheduleBtn = document.getElementById('generate-schedule');
const itineraryContainer = document.getElementById('itinerary-container');


// --- Functions ---

/**
 * Fetches lab data from labs.json
 */
async function fetchLabs() {
    try {
        const response = await fetch('labs.json');
        labs = await response.json();
    } catch (error) {
        console.error('Error fetching labs data:', error);
    }
}

/**
 * Populates the lab selection list.
 */
function displayLabs() {
    labsContainer.innerHTML = '';
    labs.forEach(lab => {
        const labDiv = document.createElement('div');
        labDiv.classList.add('lab');
        labDiv.innerHTML = `
            <input type="checkbox" id="lab-${lab.name}" name="lab" value="${lab.name}">
            <label for="lab-${lab.name}">${lab.name} (${lab.presenter}) - ${lab.location}</label>
        `;
        labsContainer.appendChild(labDiv);
    });
}

/**
 * Creates the time-slot grid for student availability input.
 */
function createTimeGrid() {
    scheduleContainer.innerHTML = '';
    for (let i = 9; i < 17; i++) { // 9am to 5pm
        const hour = i.toString().padStart(2, '0');
        const timeSlot1 = document.createElement('div');
        timeSlot1.classList.add('time-slot');
        timeSlot1.textContent = `${hour}:00`;
        timeSlot1.dataset.time = `${hour}:00`;
        scheduleContainer.appendChild(timeSlot1);

        const timeSlot2 = document.createElement('div');
        timeSlot2.classList.add('time-slot');
        timeSlot2.textContent = `${hour}:30`;
        timeSlot2.dataset.time = `${hour}:30`;
        scheduleContainer.appendChild(timeSlot2);
    }
}


// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    await fetchLabs();
    displayLabs();
    createTimeGrid();
});

let isMouseDown = false;
let selectionMode = 'add'; // 'add' or 'remove'

scheduleContainer.addEventListener('mousedown', (event) => {
    if (event.target.classList.contains('time-slot')) {
        event.preventDefault(); // Prevent text selection
        isMouseDown = true;
        const slot = event.target;

        // Determine if we're adding or removing slots
        selectionMode = slot.classList.contains('selected') ? 'remove' : 'add';

        // Toggle the first slot
        slot.classList.toggle('selected');
    }
});

scheduleContainer.addEventListener('mouseover', (event) => {
    if (isMouseDown && event.target.classList.contains('time-slot')) {
        const slot = event.target;
        if (selectionMode === 'add') {
            slot.classList.add('selected');
        } else {
            slot.classList.remove('selected');
        }
    }
});

// Add mouseup to the whole window to catch drags that end outside the container
window.addEventListener('mouseup', () => {
    if (isMouseDown) {
        isMouseDown = false;
        updateAvailability();
    }
});

function updateAvailability() {
    studentAvailability = [];
    const selectedSlots = document.querySelectorAll('.time-slot.selected');
    selectedSlots.forEach(slot => {
        studentAvailability.push(slot.dataset.time);
    });
    studentAvailability.sort();
}

generateScheduleBtn.addEventListener('click', () => {
    selectedLabs = [];
    const checkboxes = document.querySelectorAll('input[name="lab"]:checked');
    checkboxes.forEach(checkbox => {
        const lab = labs.find(l => l.name === checkbox.value);
        if (lab) selectedLabs.push(lab);
    });

    if (selectedLabs.length === 0) {
        alert('Please select at least one lab to visit.');
        return;
    }

    if (studentAvailability.length === 0) {
        alert('Please select your availability.');
        return;
    }

    generateItinerary();
});


// --- Core Scheduling Logic ---

function generateItinerary() {
    const availabilitySet = new Set();
    studentAvailability.forEach(slot => {
        const start = timeToMinutes(slot);
        for (let i = 0; i < 30; i++) {
            availabilitySet.add(start + i);
        }
    });

    if (availabilitySet.size === 0) {
        itineraryContainer.innerHTML = '<p>Please select your availability.</p>';
        return;
    }

    // --- Phase 1: Greedy Schedule Construction ---
    let schedule = buildGreedySchedule(selectedLabs, availabilitySet);

    // --- Phase 2: Duration Optimization ---
    if (schedule.length > 0) {
        schedule = optimizeScheduleDuration(schedule, availabilitySet);
    }

    if (schedule.length > 0) {
        displayItinerary(schedule);
    } else {
        itineraryContainer.innerHTML = '<p>A schedule could not be generated with the selected labs and availability.</p>';
    }
}

function buildGreedySchedule(labsToSchedule, availabilitySet) {
    const schedule = [];
    let remainingLabs = [...labsToSchedule];
    const firstAvailableMinute = Math.min(...availabilitySet);
    let currentTime = firstAvailableMinute;

    while (currentTime < Math.max(...availabilitySet) && remainingLabs.length > 0) {
        let bestLab = null;
        let bestLabEndTime = Infinity;

        // Find the next best lab to visit
        for (const lab of remainingLabs) {
            const earliestVisit = findEarliestVisit(lab, currentTime, availabilitySet);
            if (earliestVisit && earliestVisit.end < bestLabEndTime) {
                bestLab = lab;
                bestLabEndTime = earliestVisit.end;
            }
        }

        if (bestLab) {
            const visit = findEarliestVisit(bestLab, currentTime, availabilitySet);
            schedule.push({ lab: bestLab, start: visit.start, end: visit.end });
            currentTime = visit.end + 5; // 5 mins travel
            remainingLabs = remainingLabs.filter(lab => lab !== bestLab);
        } else {
            // No more labs can be scheduled, break the loop
            break;
        }
    }

    return schedule;
}

function findEarliestVisit(lab, startTime, availabilitySet) {
    const MIN_VISIT_DURATION = 10;

    for (const slot of lab.available) {
        const labStart = timeToMinutes(slot.start);
        const labEnd = timeToMinutes(slot.end);

        let potentialStartTime = Math.max(startTime, labStart);

        while (potentialStartTime + MIN_VISIT_DURATION <= labEnd) {
            const potentialEndTime = potentialStartTime + MIN_VISIT_DURATION;

            let isStudentAvailable = true;
            for (let i = potentialStartTime; i < potentialEndTime; i++) {
                if (!availabilitySet.has(i)) {
                    isStudentAvailable = false;
                    break;
                }
            }

            if (isStudentAvailable) {
                return { start: potentialStartTime, end: potentialEndTime };
            }
            potentialStartTime++;
        }
    }
    return null;
}


function optimizeScheduleDuration(schedule, availabilitySet) {
    // Binary search for the optimal visit duration
    let low = 10; // min duration
    let high = availabilitySet.size;
    let bestSchedule = schedule;

    while (low <= high) {
        const midDuration = Math.floor((low + high) / 2);
        const result = canScheduleWithDuration(schedule.map(item => item.lab), availabilitySet, midDuration);

        if (result.isPossible) {
            bestSchedule = result.schedule;
            low = midDuration + 1;
        } else {
            high = midDuration - 1;
        }
    }

    return bestSchedule;
}

function canScheduleWithDuration(labsInOrder, availabilitySet, duration) {
    const schedule = [];
    const firstAvailableMinute = Math.min(...availabilitySet);
    let currentTime = firstAvailableMinute;

    for (const lab of labsInOrder) {
        let visitScheduled = false;
        let potentialStartTime = currentTime;

        while (true) {
            const potentialEndTime = potentialStartTime + duration;

            // Check student availability
            let isStudentAvailable = true;
            for (let i = potentialStartTime; i < potentialEndTime; i++) {
                if (!availabilitySet.has(i)) {
                    isStudentAvailable = false;
                    break;
                }
            }

            if (!isStudentAvailable) {
                potentialStartTime++;
                if (potentialStartTime > Math.max(...availabilitySet)) break;
                continue;
            }

            // Check lab availability
            const isLabOpen = lab.available.some(slot =>
                potentialStartTime >= timeToMinutes(slot.start) && potentialEndTime <= timeToMinutes(slot.end)
            );

            if (isLabOpen) {
                schedule.push({ lab, start: potentialStartTime, end: potentialEndTime });
                currentTime = potentialEndTime + 5; // travel time
                visitScheduled = true;
                break;
            }

            potentialStartTime++;
            if (potentialStartTime > Math.max(...availabilitySet)) break;
        }

        if (!visitScheduled) {
            return { isPossible: false };
        }
    }
    return { isPossible: true, schedule };
}


function displayItinerary(schedule) {
    itineraryContainer.innerHTML = '<h3>Your Optimal Itinerary</h3>';
    const list = document.createElement('ul');

    schedule.forEach((item, index) => {
        const listItem = document.createElement('li');
        const duration = item.end - item.start;
        listItem.textContent = `${minutesToTime(item.start)} - ${minutesToTime(item.end)}: Visit ${item.lab.name} (${duration} mins)`;
        list.appendChild(listItem);

        if (index < schedule.length - 1) {
            const travelItem = document.createElement('li');
            travelItem.style.fontStyle = 'italic';
            travelItem.textContent = `${minutesToTime(item.end)} - ${minutesToTime(item.end + 5)}: Travel time (5 mins)`;
            list.appendChild(travelItem);
        }
    });

    itineraryContainer.appendChild(list);

    const scheduledLabs = schedule.map(item => item.lab.name);
    const allSelectedLabs = selectedLabs.map(lab => lab.name);
    const unscheduledLabs = allSelectedLabs.filter(labName => !scheduledLabs.includes(labName));

    if (unscheduledLabs.length > 0) {
        const unscheduledDiv = document.createElement('div');
        unscheduledDiv.innerHTML = `
            <h4>Labs that could not be scheduled:</h4>
            <ul>
                ${unscheduledLabs.map(labName => `<li>${labName} (No available time slot)</li>`).join('')}
            </ul>
        `;
        itineraryContainer.appendChild(unscheduledDiv);
    }
}


// --- Utility Functions ---

function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

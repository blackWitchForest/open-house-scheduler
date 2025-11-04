
// --- State ---
let labs = [];
let selectedLabs = [];
let studentAvailability = [];

// --- DOM Elements ---
const labsContainer = document.getElementById('labs-container');
const scheduleContainer = document.getElementById('schedule-container');
const generateScheduleBtn = document.getElementById('generate-schedule');
const itineraryContainer = document.getElementById('itinerary-container');
const notificationContainer = document.getElementById('notification-container');
const selectAllBtn = document.getElementById('select-all-btn');


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
        labDiv.addEventListener('click', () => {
            const checkbox = labDiv.querySelector('input');
            checkbox.checked = !checkbox.checked;
            labDiv.classList.toggle('selected', checkbox.checked);
        });
        labsContainer.appendChild(labDiv);
    });
}

/**
 * Creates the time-slot grid for student availability input.
 */
function createTimeGrid() {
    scheduleContainer.innerHTML = '';
    const startTime = 9 * 60; // 9:00 AM in minutes
    const endTime = 16 * 60 + 30; // 4:30 PM in minutes

    for (let minutes = startTime; minutes <= endTime; minutes += 30) {
        const h = Math.floor(minutes / 60).toString().padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        const timeString = `${h}:${m}`;

        const timeSlot = document.createElement('div');
        timeSlot.classList.add('time-slot');
        timeSlot.textContent = timeString;
        timeSlot.dataset.time = timeString;
        scheduleContainer.appendChild(timeSlot);
    }
}


// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    await fetchLabs();
    displayLabs();
    createTimeGrid();

    // Check for a cached schedule on page load
    const cachedSchedule = localStorage.getItem('cachedSchedule');
    const cachedAvailability = localStorage.getItem('cachedAvailability');
    if (cachedSchedule && cachedAvailability) {
        studentAvailability = JSON.parse(cachedAvailability);
        displayItinerary(JSON.parse(cachedSchedule));
        startHighlightTimer();
    }
});

let isMouseDown = false;
let selectionMode = 'add';
let startSlot = null;

scheduleContainer.addEventListener('mousedown', (event) => {
    if (event.target.classList.contains('time-slot')) {
        event.preventDefault();
        isMouseDown = true;
        startSlot = event.target;
        selectionMode = !startSlot.classList.contains('selected') ? 'add' : 'remove';
        toggleSlot(startSlot);
    }
});

scheduleContainer.addEventListener('mouseover', (event) => {
    if (isMouseDown && event.target.classList.contains('time-slot')) {
        if (!startSlot) return; // Should not happen, but as a safeguard.
        const allSlots = Array.from(document.querySelectorAll('.time-slot'));
        const startIndex = allSlots.indexOf(startSlot);
        const currentIndex = allSlots.indexOf(event.target);

        // Clear previous selections in this drag instance to handle moving back and forth
        allSlots.forEach(slot => {
            if (slot !== startSlot) slot.classList.remove('selected-drag-active');
        });

        const min = Math.min(startIndex, currentIndex);
        const max = Math.max(startIndex, currentIndex);

        for(let i = min; i <= max; i++) {
            allSlots[i].classList.add('selected-drag-active');
        }
    }
});

window.addEventListener('mouseup', () => {
    if (isMouseDown) {
        isMouseDown = false;
        startSlot = null;

        document.querySelectorAll('.time-slot.selected-drag-active').forEach(slot => {
            if(selectionMode === 'add') slot.classList.add('selected');
            else slot.classList.remove('selected');
            slot.classList.remove('selected-drag-active');
        });

        updateAvailability();
    }
});

function toggleSlot(slot) {
    if (selectionMode === 'add') {
        slot.classList.add('selected');
    } else {
        slot.classList.remove('selected');
    }
}

function updateAvailability() {
    studentAvailability = [];
    const selectedSlots = document.querySelectorAll('.time-slot.selected');
    selectedSlots.forEach(slot => {
        studentAvailability.push(slot.dataset.time);
    });
    studentAvailability.sort();
}

selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('input[name="lab"]');
    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
    checkboxes.forEach(checkbox => {
        checkbox.checked = !allChecked;
        checkbox.parentElement.classList.toggle('selected', checkbox.checked);
    });
});

generateScheduleBtn.addEventListener('click', () => {
    selectedLabs = [];
    const checkboxes = document.querySelectorAll('input[name="lab"]:checked');
    checkboxes.forEach(checkbox => {
        const lab = labs.find(l => l.name === checkbox.value);
        if (lab) selectedLabs.push(lab);
    });

    if (selectedLabs.length === 0) {
        showNotification('Please select at least one lab to visit.', 'error');
        return;
    }

    if (studentAvailability.length === 0) {
        showNotification('Please select your availability.', 'error');
        return;
    }

    generateItinerary();
});


// --- Core Scheduling Logic ---

function generateItinerary() {
    showLoading(true);
    // Use a short timeout to allow the loading indicator to render before the calculation starts
    setTimeout(() => {
        const availabilitySet = new Set();
        studentAvailability.forEach(slot => {
            const start = timeToMinutes(slot);
            for (let i = 0; i < 30; i++) {
                availabilitySet.add(start + i);
            }
        });

        if (availabilitySet.size === 0) {
            itineraryContainer.innerHTML = '<p>Please select your availability.</p>';
            showLoading(false);
            return;
        }

        // --- Phase 1: Greedy Schedule Construction ---
        let schedule = buildGreedySchedule(selectedLabs, availabilitySet);

        // --- Phase 2: Duration Optimization ---
        if (schedule.length > 0) {
            schedule = optimizeScheduleDuration(schedule, availabilitySet);
        }

        if (schedule.length > 0) {
            // Cache the successful schedule and the availability for context
            localStorage.setItem('cachedSchedule', JSON.stringify(schedule));
            localStorage.setItem('cachedAvailability', JSON.stringify(studentAvailability));
            displayItinerary(schedule);
        } else {
            // Clear cache on failure
            localStorage.removeItem('cachedSchedule');
            localStorage.removeItem('cachedAvailability');
            itineraryContainer.innerHTML = '<p>A schedule could not be generated with the selected labs and availability.</p>';
        }
        showLoading(false);
    }, 50);
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

    const availabilityMinutes = studentAvailability.map(timeToMinutes);
    const dayStart = Math.min(...availabilityMinutes);
    const dayEnd = Math.max(...availabilityMinutes) + 30;

    let currentTime = dayStart;
    let scheduleIndex = 0;

    while (currentTime < dayEnd) {
        const nextVisit = schedule[scheduleIndex];

        if (nextVisit && currentTime >= nextVisit.start) {
            const listItem = document.createElement('li');
            listItem.dataset.start = nextVisit.start;
            listItem.dataset.end = nextVisit.end;
            const duration = nextVisit.end - nextVisit.start;
            listItem.innerHTML = `
                <div class="time">${minutesToTime(nextVisit.start)} - ${minutesToTime(nextVisit.end)}</div>
                <div class="details">
                    <strong>${nextVisit.lab.name}</strong> (${duration} mins)<br>
                    <small>${nextVisit.lab.location}</small>
                </div>
            `;
            list.appendChild(listItem);
            currentTime = nextVisit.end;

            if (scheduleIndex < schedule.length - 1) {
                const travelItem = document.createElement('li');
                travelItem.classList.add('busy');
                travelItem.dataset.start = currentTime;
                travelItem.dataset.end = currentTime + 5;
                travelItem.innerHTML = `
                    <div class="time">${minutesToTime(currentTime)} - ${minutesToTime(currentTime + 5)}</div>
                    <div class="details"><em>Travel Time</em></div>
                `;
                list.appendChild(travelItem);
                currentTime += 5;
            }
            scheduleIndex++;
        } else {
            const busyEndTime = nextVisit ? nextVisit.start : dayEnd;
            if (currentTime < busyEndTime) {
                const busyItem = document.createElement('li');
                busyItem.classList.add('busy');
                busyItem.dataset.start = currentTime;
                busyItem.dataset.end = busyEndTime;
                busyItem.innerHTML = `
                    <div class="time">${minutesToTime(currentTime)} - ${minutesToTime(busyEndTime)}</div>
                    <div class="details"><em>Unavailable / Free</em></div>
                `;
                list.appendChild(busyItem);
            }
            currentTime = busyEndTime;
        }
    }
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

function startHighlightTimer() {
    setInterval(highlightCurrentEvent, 60 * 1000); // Check every minute
    highlightCurrentEvent(); // Run once immediately
}

function highlightCurrentEvent() {
    const now = new Date();
    // Use a specific locale that doesn't guarantee a particular timezone, but is necessary for the API.
    // The key is the timeZone identifier.
    const winnipegTimeStr = now.toLocaleString('en-US', { timeZone: 'America/Winnipeg' });
    const winnipegTime = new Date(winnipegTimeStr);

    if (winnipegTime.getDay() !== 5 || winnipegTime.getDate() !== 7 || winnipegTime.getMonth() !== 10) { // Friday, Nov 7th
        return;
    }

    const currentMinutes = winnipegTime.getHours() * 60 + winnipegTime.getMinutes();

    const allItems = document.querySelectorAll('#itinerary-container li');
    allItems.forEach(item => {
        item.classList.remove('current');
        const start = parseInt(item.dataset.start, 10);
        const end = parseInt(item.dataset.end, 10);
        if (currentMinutes >= start && currentMinutes < end) {
            item.classList.add('current');
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
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

function showNotification(message, type = 'info') {
    notificationContainer.textContent = message;
    notificationContainer.className = `notification ${type}`;
    notificationContainer.style.display = 'block';
    setTimeout(() => {
        notificationContainer.style.display = 'none';
    }, 3000);
}

function showLoading(isLoading) {
    if (isLoading) {
        generateScheduleBtn.disabled = true;
        generateScheduleBtn.textContent = 'Generating...';
    } else {
        generateScheduleBtn.disabled = false;
        generateScheduleBtn.textContent = 'Generate Schedule';
    }
}

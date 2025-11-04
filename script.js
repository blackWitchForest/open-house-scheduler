
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
    // Convert student's time slots (e.g., "09:00", "09:30") into a set of available 1-minute intervals for efficient lookup.
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

    let bestSchedule = null;

    // Start by trying to schedule all selected labs, then n-1, n-2, etc.
    for (let numToSchedule = selectedLabs.length; numToSchedule > 0; numToSchedule--) {
        const labCombinations = getCombinations(selectedLabs, numToSchedule);

        for (const combination of labCombinations) {
            const schedule = findBestScheduleForCombination(combination, availabilitySet);
            if (schedule) {
                // Since we're iterating from highest to lowest number of labs,
                // the first valid schedule we find is the best one.
                bestSchedule = schedule;
                break;
            }
        }
        if (bestSchedule) break;
    }

    if (bestSchedule) {
        displayItinerary(bestSchedule);
    } else {
        itineraryContainer.innerHTML = '<p>A schedule could not be generated with the selected labs and availability.</p>';
    }
}

function findBestScheduleForCombination(labsToSchedule, availabilitySet) {
    const permutations = permute(labsToSchedule);
    let bestSchedule = null;
    let maxDuration = 0;

    for (const permutation of permutations) {
        // Binary search for the optimal visit duration for this permutation
        let low = 10; // Minimum 10-minute visit
        let high = availabilitySet.size;
        let bestScheduleForPerm = null;

        while (low <= high) {
            const midDuration = Math.floor((low + high) / 2);
            if (midDuration === 0) break;

            const result = canScheduleWithDuration(permutation, availabilitySet, midDuration);

            if (result.isPossible) {
                bestScheduleForPerm = result.schedule;
                low = midDuration + 1; // Try for a longer duration
            } else {
                high = midDuration - 1; // Duration is too long
            }
        }

        if (bestScheduleForPerm) {
            const currentDuration = bestScheduleForPerm[0].end - bestScheduleForPerm[0].start;
            if (currentDuration > maxDuration) {
                maxDuration = currentDuration;
                bestSchedule = bestScheduleForPerm;
            }
        }
    }
    return bestSchedule;
}

function canScheduleWithDuration(permutation, availabilitySet, duration) {
    const schedule = [];
    const firstAvailableMinute = Math.min(...availabilitySet);
    let currentTime = firstAvailableMinute;

    for (const lab of permutation) {
        let visitScheduled = false;

        // Find the earliest possible start time for this lab visit
        let potentialStartTime = currentTime;
        while (true) {
            const visitEndTime = potentialStartTime + duration;

            // Check if student is available during this time slot
            let isStudentAvailable = true;
            for (let i = potentialStartTime; i < visitEndTime; i++) {
                if (!availabilitySet.has(i)) {
                    isStudentAvailable = false;
                    break;
                }
            }

            if (!isStudentAvailable) {
                 // Slide to the next available minute and try again
                 potentialStartTime++;
                 if (potentialStartTime > Math.max(...availabilitySet)) break; // No more time left
                 continue;
            }


            // Check if the lab is open during this time slot
            const isLabOpen = lab.available.some(slot => {
                const labStart = timeToMinutes(slot.start);
                const labEnd = timeToMinutes(slot.end);
                return potentialStartTime >= labStart && visitEndTime <= labEnd;
            });

            if (isLabOpen) {
                schedule.push({ lab, start: potentialStartTime, end: visitEndTime });
                currentTime = visitEndTime + 5; // Add 5-minute travel time
                visitScheduled = true;
                break; // Move to the next lab
            }

            potentialStartTime++;
            if (potentialStartTime > Math.max(...availabilitySet)) break;
        }

        if (!visitScheduled) {
            return { isPossible: false }; // Cannot schedule this lab, so the permutation fails
        }
    }
    return { isPossible: true, schedule };
}


function displayItinerary(schedule) {
    itineraryContainer.innerHTML = '<h3>Your Optimal Itinerary</h3>';
    const list = document.createElement('ul');

    schedule.forEach(item => {
        const listItem = document.createElement('li');
        const duration = item.end - item.start;
        listItem.textContent = `${minutesToTime(item.start)} - ${minutesToTime(item.end)}: Visit ${item.lab.name} (${duration} mins)`;
        list.appendChild(listItem);

        if (schedule.indexOf(item) < schedule.length - 1) {
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

function getCombinations(array, size) {
    const combinations = [];
    function helper(start, combination) {
        if (combination.length === size) {
            combinations.push([...combination]);
            return;
        }
        for (let i = start; i < array.length; i++) {
            combination.push(array[i]);
            helper(i + 1, combination);
            combination.pop();
        }
    }
    helper(0, []);
    return combinations;
}

function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function permute(arr) {
    const result = [];
    const helper = (currentPerm, remaining) => {
        if (remaining.length === 0) {
            result.push(currentPerm);
            return;
        }
        for (let i = 0; i < remaining.length; i++) {
            const nextPerm = currentPerm.concat(remaining[i]);
            const nextRemaining = remaining.slice(0, i).concat(remaining.slice(i + 1));
            helper(nextPerm, nextRemaining);
        }
    };
    helper([], arr);
    return result;
}

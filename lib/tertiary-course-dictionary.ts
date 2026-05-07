// ============================================================================
// TERTIARY COURSE DICTIONARY
// Course codes and subject names for all tertiary programs
// Organized by Program, Year, and Term
// ============================================================================

export type Program = 'BSA' | 'BSBA' | 'BSCpE' | 'BSCS' | 'BSHM' | 'BSIT' | 'BSTM'
export type YearTerm = '1st_1st' | '1st_2nd' | '2nd_1st' | '2nd_2nd' | '3rd_1st' | '3rd_2nd' | '4th_1st' | '4th_2nd'

export interface Course {
  course_code: string
  subject_name: string
  year_term: YearTerm
}

export interface ProgramCourses {
  program: Program
  courses: Course[]
}

// ============================================================================
// BSA - BACHELOR OF SCIENCE IN ACCOUNTANCY
// ============================================================================
const BSA_COURSES: Course[] = [
  // FIRST YEAR - FIRST TERM
  { course_code: 'ACCT1001', subject_name: 'Basic Accounting', year_term: '1st_1st' },
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '1st_1st' },
  { course_code: 'STIC1002', subject_name: 'Euthenics 1', year_term: '1st_1st' },
  { course_code: 'GEDC1041', subject_name: 'Philippine Popular Culture', year_term: '1st_1st' },
  { course_code: 'NSTP1008', subject_name: 'National Service Training Program 1', year_term: '1st_1st' },
  { course_code: 'PHED1005', subject_name: 'P.E./PATHFIT 1: Movement Competency Training', year_term: '1st_1st' },
  { course_code: 'GEDC1006', subject_name: 'Readings in Philippine History', year_term: '1st_1st' },
  { course_code: 'GEDC1013', subject_name: 'Science, Technology and Society', year_term: '1st_1st' },
  { course_code: 'GEDC1008', subject_name: 'Understanding the Self', year_term: '1st_1st' },
  
  // FIRST YEAR - SECOND TERM
  { course_code: 'ACCT1002', subject_name: 'Conceptual Framework and Accounting Standards', year_term: '1st_2nd' },
  { course_code: 'ACCT1003', subject_name: 'Financial Accounting and Reporting', year_term: '1st_2nd' },
  { course_code: 'BUSS1002', subject_name: 'Income Taxation', year_term: '1st_2nd' },
  { course_code: 'BUSS1003', subject_name: 'Law on Obligations and Contracts', year_term: '1st_2nd' },
  { course_code: 'CBMC1001', subject_name: 'Operations Management (TQM)', year_term: '1st_2nd' },
  { course_code: 'GEDC1009', subject_name: 'Ethics', year_term: '1st_2nd' },
  { course_code: 'NSTP1010', subject_name: 'National Service Training Program 2', year_term: '1st_2nd' },
  { course_code: 'PHED1006', subject_name: 'P.E./PATHFIT 2: Exercise-based Fitness Activities', year_term: '1st_2nd' },
  { course_code: 'GEDC1005', subject_name: 'Mathematics in the Modern World', year_term: '1st_2nd' },
  { course_code: 'STIC1003', subject_name: 'Computer Productivity Tools', year_term: '1st_2nd' },
  
  // SECOND YEAR - FIRST TERM
  { course_code: 'ACCT1004', subject_name: 'Business Laws and Regulations', year_term: '2nd_1st' },
  { course_code: 'GEDC1045', subject_name: 'Great Books', year_term: '2nd_1st' },
  { course_code: 'ACCT1005', subject_name: 'Intermediate Accounting 1', year_term: '2nd_1st' },
  { course_code: 'INTE1011', subject_name: 'IT Application Tools in Business', year_term: '2nd_1st' },
  { course_code: 'COSC1003', subject_name: 'Data Structures and Algorithms', year_term: '2nd_1st' },
  { course_code: 'PHED1007', subject_name: 'P.E./PATHFIT 3: Individual-Dual Sports', year_term: '2nd_1st' },
  { course_code: 'GEDC1014', subject_name: "Rizal's Life and Works", year_term: '2nd_1st' },
  { course_code: 'ACCT1006', subject_name: 'Intermediate Accounting 2', year_term: '2nd_1st' },
  
  // SECOND YEAR - SECOND TERM
  { course_code: 'ACCT1007', subject_name: 'Accounting Information System', year_term: '2nd_2nd' },
  { course_code: 'ACCT1008', subject_name: 'Business Taxation', year_term: '2nd_2nd' },
  { course_code: 'BUSS1012', subject_name: 'Financial Management', year_term: '2nd_2nd' },
  { course_code: 'ACCT1009', subject_name: 'Intermediate Accounting 3', year_term: '2nd_2nd' },
  { course_code: 'GEDC1003', subject_name: 'The Entrepreneurial Mind', year_term: '2nd_2nd' },
  { course_code: 'PHED1008', subject_name: 'P.E./PATHFIT 4: Team Sports', year_term: '2nd_2nd' },
  { course_code: 'ACCT1010', subject_name: 'Cost Accounting', year_term: '2nd_2nd' },
  { course_code: 'ACCT1011', subject_name: 'Management Science', year_term: '2nd_2nd' },
  
  // THIRD YEAR - FIRST TERM
  { course_code: 'ACCT1013', subject_name: 'Cost Accounting and Control', year_term: '3rd_1st' },
  { course_code: 'ACCT1014', subject_name: 'Economic Development', year_term: '3rd_1st' },
  { course_code: 'ACCT1015', subject_name: 'Financial Markets', year_term: '3rd_1st' },
  { course_code: 'ACCT1016', subject_name: 'Strategic Business Analysis', year_term: '3rd_1st' },
  { course_code: 'ACCT1017', subject_name: 'Accounting for Government and Not-for-Profit Organizations', year_term: '3rd_1st' },
  { course_code: 'ACCT1018', subject_name: 'Auditing in a CIS Environment', year_term: '3rd_1st' },
  { course_code: 'CBMC1002', subject_name: 'Strategic Management', year_term: '3rd_1st' },
  { course_code: 'ACCT1019', subject_name: 'Assurance Principles, Professional Ethics and Good Governance', year_term: '3rd_1st' },
  
  // THIRD YEAR - SECOND TERM
  { course_code: 'ACCT1021', subject_name: 'Accounting Research Methods', year_term: '3rd_2nd' },
  { course_code: 'ACCT1022', subject_name: 'Strategic Cost Management', year_term: '3rd_2nd' },
  { course_code: 'ACCT1023', subject_name: 'Accounting for Business Combinations', year_term: '3rd_2nd' },
  { course_code: 'ACCT1024', subject_name: 'Advance Financial Accounting and Reporting 1', year_term: '3rd_2nd' },
  { course_code: 'ACCT1025', subject_name: 'Auditing Theory and Practice 1', year_term: '3rd_2nd' },
  { course_code: 'ACCT1026', subject_name: 'Accounting Review 1 (Theory)', year_term: '3rd_2nd' },
  { course_code: 'ACCT1027', subject_name: 'Accounting Review 1 (Problems)', year_term: '3rd_2nd' },
  
  // FOURTH YEAR - FIRST TERM
  { course_code: 'ACCT1029', subject_name: 'Advance Financial Accounting and Reporting 2', year_term: '4th_1st' },
  { course_code: 'ACCT1030', subject_name: 'Auditing Theory and Practice 2', year_term: '4th_1st' },
  { course_code: 'ACCT1031', subject_name: 'Accounting Review 2 (Theory)', year_term: '4th_1st' },
  { course_code: 'ACCT1032', subject_name: 'Accounting Review 2 (Problems)', year_term: '4th_1st' },
  { course_code: 'ACCT1033', subject_name: 'Management Advisory Services 1 (MAS)', year_term: '4th_1st' },
  { course_code: 'STIC1007', subject_name: 'Euthenics 2', year_term: '4th_1st' },
  { course_code: 'ACCT1034', subject_name: 'Accounting Review 3 (Theory)', year_term: '4th_1st' },
  
  // FOURTH YEAR - SECOND TERM
  { course_code: 'ACCT1036', subject_name: 'Accounting Review 3 (Problems)', year_term: '4th_2nd' },
  { course_code: 'ACCT1037', subject_name: 'Management Advisory Services 2 (MAS)', year_term: '4th_2nd' },
  { course_code: 'ACCT1038', subject_name: 'BSA Practicum (300 hours)', year_term: '4th_2nd' },
  { course_code: 'ACCT1039', subject_name: 'Thesis Writing (Research Paper)', year_term: '4th_2nd' },
]

// ============================================================================
// BSBA - BACHELOR OF SCIENCE IN BUSINESS ADMINISTRATION
// ============================================================================
const BSBA_COURSES: Course[] = [
  // FIRST YEAR - FIRST TERM
  { course_code: 'BUSS1001', subject_name: 'Basic Microeconomics', year_term: '1st_1st' },
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '1st_1st' },
  { course_code: 'STIC1002', subject_name: 'Euthenics 1', year_term: '1st_1st' },
  { course_code: 'NSTP1008', subject_name: 'National Service Training Program 1', year_term: '1st_1st' },
  { course_code: 'PHED1005', subject_name: 'P.E./PATHFIT 1: Movement Competency Training', year_term: '1st_1st' },
  { course_code: 'GEDC1006', subject_name: 'Readings in Philippine History', year_term: '1st_1st' },
  { course_code: 'GEDC1008', subject_name: 'Understanding the Self', year_term: '1st_1st' },
  
  // FIRST YEAR - SECOND TERM
  { course_code: 'GEDC1009', subject_name: 'Ethics', year_term: '1st_2nd' },
  { course_code: 'NSTP1010', subject_name: 'National Service Training Program 2', year_term: '1st_2nd' },
  { course_code: 'PHED1006', subject_name: 'P.E./PATHFIT 2: Exercise-based Fitness Activities', year_term: '1st_2nd' },
  { course_code: 'GEDC1005', subject_name: 'Mathematics in the Modern World', year_term: '1st_2nd' },
  { course_code: 'GEDC1013', subject_name: 'Science, Technology, and Society', year_term: '1st_2nd' },
  { course_code: 'STIC1003', subject_name: 'Computer Productivity Tools', year_term: '1st_2nd' },
  { course_code: 'BUSS1004', subject_name: 'Productivity and Quality Tools', year_term: '1st_2nd' },
  
  // SECOND YEAR - FIRST TERM
  { course_code: 'GEDC1041', subject_name: 'Philippine Popular Culture', year_term: '2nd_1st' },
  { course_code: 'GEDC1014', subject_name: "Rizal's Life and Works", year_term: '2nd_1st' },
  { course_code: 'GEDC1010', subject_name: 'Art Appreciation', year_term: '2nd_1st' },
  { course_code: 'PHED1007', subject_name: 'P.E./PATHFIT 3: Individual-Dual Sports', year_term: '2nd_1st' },
  { course_code: 'BUSS1005', subject_name: 'Business Finance', year_term: '2nd_1st' },
  { course_code: 'BUSS1006', subject_name: 'Marketing Management', year_term: '2nd_1st' },
  { course_code: 'INTE1011', subject_name: 'IT Application Tools in Business', year_term: '2nd_1st' },
  { course_code: 'BUSS1007', subject_name: 'Business Statistics', year_term: '2nd_1st' },
  
  // SECOND YEAR - SECOND TERM
  { course_code: 'BUSS1008', subject_name: 'Business Law (Obligations and Contracts)', year_term: '2nd_2nd' },
  { course_code: 'BUSS1011', subject_name: 'Taxation (Income Taxation)', year_term: '2nd_2nd' },
  { course_code: 'GEDC1003', subject_name: 'The Entrepreneurial Mind', year_term: '2nd_2nd' },
  { course_code: 'PHED1008', subject_name: 'P.E./PATHFIT 4: Team Sports', year_term: '2nd_2nd' },
  { course_code: 'CBMC1001', subject_name: 'Operations Management (TQM)', year_term: '2nd_2nd' },
  { course_code: 'BUSS1012', subject_name: 'Financial Management', year_term: '2nd_2nd' },
  { course_code: 'BUSS1013', subject_name: 'Social, Economic, and Global Environment', year_term: '2nd_2nd' },
  { course_code: 'BUSS1014', subject_name: 'Good Governance and Social Responsibility', year_term: '2nd_2nd' },
  
  // THIRD YEAR - FIRST TERM
  { course_code: 'BUSS1015', subject_name: 'Business Research', year_term: '3rd_1st' },
  { course_code: 'BUSS1016', subject_name: 'Good Governance and Social Responsibility', year_term: '3rd_1st' },
  { course_code: 'GEDC1045', subject_name: 'Great Books', year_term: '3rd_1st' },
  { course_code: 'BUSS1017', subject_name: 'Applied Business Tools and Technologies', year_term: '3rd_1st' },
  { course_code: 'BUSS1018', subject_name: 'Fundamentals of Accounting', year_term: '3rd_1st' },
  { course_code: 'BUSS1019', subject_name: 'Micro Perspective of Tourism and Hospitality', year_term: '3rd_1st' },
  { course_code: 'BUSS1020', subject_name: 'Business Analytics', year_term: '3rd_1st' },
  
  // THIRD YEAR - SECOND TERM
  { course_code: 'BUSS1009', subject_name: 'Human Resource Management', year_term: '3rd_2nd' },
  { course_code: 'CBMC1002', subject_name: 'Strategic Management', year_term: '3rd_2nd' },
  { course_code: 'INSY1007', subject_name: 'Management Information Systems', year_term: '3rd_2nd' },
  { course_code: 'BUSS1021', subject_name: 'Customer Service and Relations', year_term: '3rd_2nd' },
  { course_code: 'BUSS1022', subject_name: 'Total Quality Management (TQM)', year_term: '3rd_2nd' },
  { course_code: 'BUSS1023', subject_name: 'Entrepreneurship', year_term: '3rd_2nd' },
  
  // FOURTH YEAR - FIRST TERM
  { course_code: 'BUSS1024', subject_name: 'Feasibility Study/Business Plan', year_term: '4th_1st' },
  { course_code: 'STIC1007', subject_name: 'Euthenics 2', year_term: '4th_1st' },
  { course_code: 'BUSS1025', subject_name: 'BSBA Practicum (300 hours)', year_term: '4th_1st' },
  
  // FOURTH YEAR - SECOND TERM
  { course_code: 'BUSS1026', subject_name: 'Thesis Writing', year_term: '4th_2nd' },
]

// ============================================================================
// BSCpE - BACHELOR OF SCIENCE IN COMPUTER ENGINEERING
// ============================================================================
const BSCpE_COURSES: Course[] = [
  // FIRST YEAR - FIRST TERM
  { course_code: 'ENGR1001', subject_name: 'Programming Logic and Design', year_term: '1st_1st' },
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '1st_1st' },
  { course_code: 'STIC1002', subject_name: 'Euthenics 1', year_term: '1st_1st' },
  { course_code: 'GEDC1005', subject_name: 'Mathematics in the Modern World', year_term: '1st_1st' },
  { course_code: 'NSTP1008', subject_name: 'National Service Training Program 1', year_term: '1st_1st' },
  { course_code: 'PHED1005', subject_name: 'P.E./PATHFIT 1: Movement Competency Training', year_term: '1st_1st' },
  { course_code: 'GEDC1008', subject_name: 'Understanding the Self', year_term: '1st_1st' },
  { course_code: 'ENGR1002', subject_name: 'College Calculus (Differential)', year_term: '1st_1st' },
  { course_code: 'ENGR1003', subject_name: 'Chemistry for Engineers', year_term: '1st_1st' },
  { course_code: 'ENGR1004', subject_name: 'Computer Engineering as a Discipline', year_term: '1st_1st' },
  
  // FIRST YEAR - SECOND TERM
  { course_code: 'INTE1001', subject_name: 'Object-Oriented Programming', year_term: '1st_2nd' },
  { course_code: 'ENGR1048', subject_name: 'Discrete Mathematics', year_term: '1st_2nd' },
  { course_code: 'GEDC1010', subject_name: 'Art Appreciation', year_term: '1st_2nd' },
  { course_code: 'NSTP1010', subject_name: 'National Service Training Program 2', year_term: '1st_2nd' },
  { course_code: 'PHED1006', subject_name: 'P.E./PATHFIT 2: Exercise-based Fitness Activities', year_term: '1st_2nd' },
  { course_code: 'GEDC1016', subject_name: 'Purposive Communication', year_term: '1st_2nd' },
  { course_code: 'GEDC1013', subject_name: 'Science, Technology, and Society', year_term: '1st_2nd' },
  { course_code: 'ENGR1005', subject_name: 'College Calculus (Integral)', year_term: '1st_2nd' },
  { course_code: 'ENGR1007', subject_name: 'Physics for Engineers', year_term: '1st_2nd' },
  
  // SECOND YEAR - FIRST TERM
  { course_code: 'ENGR1008', subject_name: 'Fundamentals of Electrical Circuits', year_term: '2nd_1st' },
  { course_code: 'ENGR1009', subject_name: 'Operating Systems', year_term: '2nd_1st' },
  { course_code: 'COSC1004', subject_name: 'Data Structures and Algorithms', year_term: '2nd_1st' },
  { course_code: 'ENGR1010', subject_name: 'Emerging Technologies in CpE', year_term: '2nd_1st' },
  { course_code: 'GEDC1003', subject_name: 'The Entrepreneurial Mind', year_term: '2nd_1st' },
  { course_code: 'GEDC1014', subject_name: "Rizal's Life and Works", year_term: '2nd_1st' },
  { course_code: 'ENGR1011', subject_name: 'Differential Equations', year_term: '2nd_1st' },
  { course_code: 'PHED1007', subject_name: 'P.E./PATHFIT 3: Individual-Dual Sports', year_term: '2nd_1st' },
  { course_code: 'ENGR1006', subject_name: 'Engineering Drawing and Plans', year_term: '2nd_1st' },
  
  // SECOND YEAR - SECOND TERM
  { course_code: 'ENGR1012', subject_name: 'Numerical Methods', year_term: '2nd_2nd' },
  { course_code: 'ENGR1013', subject_name: 'Fundamentals of Electronic Circuits', year_term: '2nd_2nd' },
  { course_code: 'ENGR1014', subject_name: 'Software Design', year_term: '2nd_2nd' },
  { course_code: 'GEDC1041', subject_name: 'Philippine Popular Culture', year_term: '2nd_2nd' },
  { course_code: 'ENGR1015', subject_name: 'Fundamentals of Mixed Signals and Sensors', year_term: '2nd_2nd' },
  { course_code: 'ENGR1054', subject_name: 'Engineering Data Analysis', year_term: '2nd_2nd' },
  { course_code: 'PHED1008', subject_name: 'P.E./PATHFIT 4: Team Sports', year_term: '2nd_2nd' },
  
  // THIRD YEAR - FIRST TERM
  { course_code: 'ENGR1015', subject_name: 'Fundamentals of Mixed Signals and Sensors', year_term: '3rd_1st' },
  { course_code: 'ENGR1017', subject_name: 'Logic Circuits and Design', year_term: '3rd_1st' },
  { course_code: 'ENGR1018', subject_name: 'Feedback and Control Systems', year_term: '3rd_1st' },
  { course_code: 'ENGR1019', subject_name: 'Object Oriented Programming', year_term: '3rd_1st' },
  { course_code: 'ENGR1020', subject_name: 'Microprocessors', year_term: '3rd_1st' },
  { course_code: 'ENGR1021', subject_name: 'Computer Engineering Drafting and Design', year_term: '3rd_1st' },
  { course_code: 'STIC1007', subject_name: 'Euthenics 2', year_term: '3rd_1st' },
  
  // THIRD YEAR - SECOND TERM
  { course_code: 'ENGR1022', subject_name: 'Basic Occupational Health and Safety', year_term: '3rd_2nd' },
  { course_code: 'ENGR1023', subject_name: 'Microprocessors', year_term: '3rd_2nd' },
  { course_code: 'ENGR1024', subject_name: 'Network Systems and Administration', year_term: '3rd_2nd' },
  { course_code: 'ENGR1025', subject_name: 'Electrical and Electronics Engineering Design', year_term: '3rd_2nd' },
  { course_code: 'ENGR1026', subject_name: 'Computer Engineering Design', year_term: '3rd_2nd' },
  
  // FOURTH YEAR - FIRST TERM
  { course_code: 'ENGR1050', subject_name: 'Computer Architecture and Organization', year_term: '4th_1st' },
  { course_code: 'INTE1038', subject_name: 'Technopreneurship', year_term: '4th_1st' },
  { course_code: 'ENGR1051', subject_name: 'CpE Elective 3', year_term: '4th_1st' },
  { course_code: 'ENGR1052', subject_name: 'CpE Elective 4', year_term: '4th_1st' },
  { course_code: 'ENGR1053', subject_name: 'CpE Design Project', year_term: '4th_1st' },
  
  // FOURTH YEAR - SECOND TERM
  { course_code: 'ENGR1027', subject_name: 'CpE Practicum (300 hours)', year_term: '4th_2nd' },
]

// ============================================================================
// BSCS - BACHELOR OF SCIENCE IN COMPUTER SCIENCE
// ============================================================================
const BSCS_COURSES: Course[] = [
  // FIRST YEAR - FIRST TERM
  { course_code: 'CITE1004', subject_name: 'Introduction to Computing', year_term: '1st_1st' },
  { course_code: 'CITE1003', subject_name: 'Computer Programming 1', year_term: '1st_1st' },
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '1st_1st' },
  { course_code: 'STIC1002', subject_name: 'Euthenics 1', year_term: '1st_1st' },
  { course_code: 'GEDC1016', subject_name: 'Purposive Communication', year_term: '1st_1st' },
  { course_code: 'NSTP1008', subject_name: 'National Service Training Program 1', year_term: '1st_1st' },
  { course_code: 'PHED1005', subject_name: 'P.E./PATHFIT 1: Movement Competency Training', year_term: '1st_1st' },
  { course_code: 'GEDC1008', subject_name: 'Understanding the Self', year_term: '1st_1st' },
  
  // FIRST YEAR - SECOND TERM
  { course_code: 'CITE1006', subject_name: 'Computer Programming 2', year_term: '1st_2nd' },
  { course_code: 'COSC1002', subject_name: 'Discrete Structures 1 (Discrete Mathematics)', year_term: '1st_2nd' },
  { course_code: 'GEDC1010', subject_name: 'Art Appreciation', year_term: '1st_2nd' },
  { course_code: 'NSTP1010', subject_name: 'National Service Training Program 2', year_term: '1st_2nd' },
  { course_code: 'PHED1006', subject_name: 'P.E./PATHFIT 2: Exercise-based Fitness Activities', year_term: '1st_2nd' },
  { course_code: 'GEDC1005', subject_name: 'Mathematics in the Modern World', year_term: '1st_2nd' },
  { course_code: 'GEDC1013', subject_name: 'Science, Technology, and Society', year_term: '1st_2nd' },
  { course_code: 'COSC1046', subject_name: 'College Calculus', year_term: '1st_2nd' },
  
  // SECOND YEAR - FIRST TERM
  { course_code: 'COSC1003', subject_name: 'Data Structures and Algorithms', year_term: '2nd_1st' },
  { course_code: 'COSC1006', subject_name: 'Discrete Structures 2', year_term: '2nd_1st' },
  { course_code: 'GEDC1041', subject_name: 'Philippine Popular Culture', year_term: '2nd_1st' },
  { course_code: 'PHED1007', subject_name: 'P.E./PATHFIT 3: Individual-Dual Sports', year_term: '2nd_1st' },
  { course_code: 'GEDC1006', subject_name: 'Readings in Philippine History', year_term: '2nd_1st' },
  { course_code: 'CITE1009', subject_name: 'Computer Organization and Architecture', year_term: '2nd_1st' },
  { course_code: 'COSC1007', subject_name: 'Human-Computer Interaction', year_term: '2nd_1st' },
  
  // SECOND YEAR - SECOND TERM
  { course_code: 'COSC1009', subject_name: 'Design and Analysis of Algorithms', year_term: '2nd_2nd' },
  { course_code: 'CITE1011', subject_name: 'Information Management', year_term: '2nd_2nd' },
  { course_code: 'GEDC1003', subject_name: 'The Entrepreneurial Mind', year_term: '2nd_2nd' },
  { course_code: 'GEDC1009', subject_name: 'Ethics', year_term: '2nd_2nd' },
  { course_code: 'PHED1008', subject_name: 'P.E./PATHFIT 4: Team Sports', year_term: '2nd_2nd' },
  { course_code: 'CITE1010', subject_name: 'Web Programming', year_term: '2nd_2nd' },
  { course_code: 'COSC1010', subject_name: 'Platform Technologies (Cloud Computing)', year_term: '2nd_2nd' },
  
  // THIRD YEAR - FIRST TERM
  { course_code: 'COSC1014', subject_name: 'Theory of Computations with Automata', year_term: '3rd_1st' },
  { course_code: 'CITE1008', subject_name: 'Application Development and Emerging Technologies', year_term: '3rd_1st' },
  { course_code: 'INSY1011', subject_name: 'Advanced Database Systems', year_term: '3rd_1st' },
  { course_code: 'COSC1015', subject_name: 'Introduction to Artificial Intelligence', year_term: '3rd_1st' },
  { course_code: 'COSC1043', subject_name: 'CS Elective 1 (Mobile Application Development)', year_term: '3rd_1st' },
  { course_code: 'COSC1044', subject_name: 'CS Elective 2 (Web Development)', year_term: '3rd_1st' },
  { course_code: 'COSC1018', subject_name: 'Software Engineering', year_term: '3rd_1st' },
  
  // THIRD YEAR - SECOND TERM
  { course_code: 'COSC1016', subject_name: 'Modeling and Simulation', year_term: '3rd_2nd' },
  { course_code: 'COSC1042', subject_name: 'Game Programming', year_term: '3rd_2nd' },
  { course_code: 'COSC1020', subject_name: 'Programming Languages', year_term: '3rd_2nd' },
  { course_code: 'COSC1021', subject_name: 'Fundamentals of Data Science', year_term: '3rd_2nd' },
  { course_code: 'COSC1045', subject_name: 'CS Elective 3 (Internet of Things)', year_term: '3rd_2nd' },
  { course_code: 'COSC1047', subject_name: 'CS Elective 4 (Computer Graphics)', year_term: '3rd_2nd' },
  
  // FOURTH YEAR - FIRST TERM
  { course_code: 'COSC1008', subject_name: 'Platform Technology (Operating Systems)', year_term: '4th_1st' },
  { course_code: 'INTE1005', subject_name: 'Capstone Project 1', year_term: '4th_1st' },
  { course_code: 'STIC1007', subject_name: 'Euthenics 2', year_term: '4th_1st' },
  { course_code: 'COSC1049', subject_name: 'Information Assurance and Security 1', year_term: '4th_1st' },
  { course_code: 'COSC1050', subject_name: 'Information Assurance and Security 2', year_term: '4th_1st' },
  
  // FOURTH YEAR - SECOND TERM
  { course_code: 'COSC1051', subject_name: 'CS Practicum (300 hours)', year_term: '4th_2nd' },
  { course_code: 'INTE1038', subject_name: 'Technopreneurship', year_term: '4th_2nd' },
]

// ============================================================================
// BSHM - BACHELOR OF SCIENCE IN HOSPITALITY MANAGEMENT
// ============================================================================
const BSHM_COURSES: Course[] = [
  // FIRST YEAR - FIRST TERM
  { course_code: 'STIC1002', subject_name: 'Euthenics 1', year_term: '1st_1st' },
  { course_code: 'GEDC1005', subject_name: 'Mathematics in the Modern World', year_term: '1st_1st' },
  { course_code: 'NSTP1008', subject_name: 'National Service Training Program 1', year_term: '1st_1st' },
  { course_code: 'PHED1005', subject_name: 'P.E./PATHFIT 1: Movement Competency Training', year_term: '1st_1st' },
  { course_code: 'GEDC1006', subject_name: 'Readings in Philippine History', year_term: '1st_1st' },
  { course_code: 'GEDC1008', subject_name: 'Understanding the Self', year_term: '1st_1st' },
  { course_code: 'CTHC1003', subject_name: 'Macro Perspective of Tourism and Hospitality', year_term: '1st_1st' },
  { course_code: 'CTHC1004', subject_name: 'Risk Management as Applied to Safety, Security, and Sanitation', year_term: '1st_1st' },
  
  // FIRST YEAR - SECOND TERM
  { course_code: 'NSTP1010', subject_name: 'National Service Training Program 2', year_term: '1st_2nd' },
  { course_code: 'PHED1006', subject_name: 'P.E./PATHFIT 2: Exercise-based Fitness Activities', year_term: '1st_2nd' },
  { course_code: 'GEDC1016', subject_name: 'Purposive Communication', year_term: '1st_2nd' },
  { course_code: 'HOSP1002', subject_name: 'Kitchen Essentials and Basic Food Preparation', year_term: '1st_2nd' },
  { course_code: 'STIC1003', subject_name: 'Computer Productivity Tools', year_term: '1st_2nd' },
  { course_code: 'CTHC1006', subject_name: 'Philippine Culture and Tourism Geography', year_term: '1st_2nd' },
  { course_code: 'CTHC1007', subject_name: 'Micro Perspective of Tourism and Hospitality', year_term: '1st_2nd' },
  
  // SECOND YEAR - FIRST TERM
  { course_code: 'GEDC1010', subject_name: 'Art Appreciation', year_term: '2nd_1st' },
  { course_code: 'PHED1007', subject_name: 'P.E./PATHFIT 3: Individual-Dual Sports', year_term: '2nd_1st' },
  { course_code: 'HOSP1007', subject_name: 'Hotel Front Office Operations with Fidelio', year_term: '2nd_1st' },
  { course_code: 'CTHC1005', subject_name: 'Total Quality Management in Tourism and Hospitality', year_term: '2nd_1st' },
  { course_code: 'HOSP1006', subject_name: 'Housekeeping Operations', year_term: '2nd_1st' },
  { course_code: 'HOSP1008', subject_name: 'Food and Beverage Service Operations', year_term: '2nd_1st' },
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '2nd_1st' },
  
  // SECOND YEAR - SECOND TERM
  { course_code: 'GEDC1009', subject_name: 'Ethics', year_term: '2nd_2nd' },
  { course_code: 'PHED1008', subject_name: 'P.E./PATHFIT 4: Team Sports', year_term: '2nd_2nd' },
  { course_code: 'GEDC1013', subject_name: 'Science, Technology, and Society', year_term: '2nd_2nd' },
  { course_code: 'HOSP1009', subject_name: 'Fundamentals in Lodging Operations', year_term: '2nd_2nd' },
  { course_code: 'HOSP1010', subject_name: 'Baking and Pastry Production', year_term: '2nd_2nd' },
  { course_code: 'HOSP1011', subject_name: 'Wine, Spirits, and Other Beverages', year_term: '2nd_2nd' },
  { course_code: 'HOSP1012', subject_name: 'Supply Chain Management in Hospitality', year_term: '2nd_2nd' },
  
  // THIRD YEAR - FIRST TERM
  { course_code: 'CBMC1001', subject_name: 'Operations Management (TQM)', year_term: '3rd_1st' },
  { course_code: 'GEDC1003', subject_name: 'The Entrepreneurial Mind', year_term: '3rd_1st' },
  { course_code: 'GEDC1045', subject_name: 'Great Books', year_term: '3rd_1st' },
  { course_code: 'HOSP1013', subject_name: 'Foreign Language (Mandarin/Nihongo)', year_term: '3rd_1st' },
  { course_code: 'HOSP1014', subject_name: 'Meal Management', year_term: '3rd_1st' },
  { course_code: 'HOSP1015', subject_name: 'Events Management', year_term: '3rd_1st' },
  { course_code: 'HOSP1016', subject_name: 'Research in Hospitality', year_term: '3rd_1st' },
  
  // THIRD YEAR - SECOND TERM
  { course_code: 'CBMC1003', subject_name: 'Strategic Management', year_term: '3rd_2nd' },
  { course_code: 'GEDC1041', subject_name: 'Philippine Popular Culture', year_term: '3rd_2nd' },
  { course_code: 'HOSP1021', subject_name: 'Hospitality Marketing and Sales', year_term: '3rd_2nd' },
  { course_code: 'HOSP1022', subject_name: 'Hospitality Finance and Controlling', year_term: '3rd_2nd' },
  { course_code: 'HOSP1023', subject_name: 'Human Resource Management', year_term: '3rd_2nd' },
  { course_code: 'HOSP1024', subject_name: 'Ergonomics and Facilities Planning for the Hospitality Industry', year_term: '3rd_2nd' },
  
  // FOURTH YEAR - FIRST TERM
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '4th_1st' },
  { course_code: 'STIC1007', subject_name: 'Euthenics 2', year_term: '4th_1st' },
  { course_code: 'HOSP1025', subject_name: 'Hospitality Internship (600 hours)', year_term: '4th_1st' },
]

// ============================================================================
// BSIT - BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY
// ============================================================================
const BSIT_COURSES: Course[] = [
  // FIRST YEAR - FIRST TERM
  { course_code: 'CITE1004', subject_name: 'Introduction to Computing', year_term: '1st_1st' },
  { course_code: 'CITE1003', subject_name: 'Computer Programming 1', year_term: '1st_1st' },
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '1st_1st' },
  { course_code: 'STIC1002', subject_name: 'Euthenics 1', year_term: '1st_1st' },
  { course_code: 'GEDC1016', subject_name: 'Purposive Communication', year_term: '1st_1st' },
  { course_code: 'NSTP1008', subject_name: 'National Service Training Program 1', year_term: '1st_1st' },
  { course_code: 'PHED1005', subject_name: 'P.E./PATHFIT 1: Movement Competency Training', year_term: '1st_1st' },
  { course_code: 'GEDC1041', subject_name: 'Philippine Popular Culture', year_term: '1st_1st' },
  { course_code: 'GEDC1008', subject_name: 'Understanding the Self', year_term: '1st_1st' },
  
  // FIRST YEAR - SECOND TERM
  { course_code: 'CITE1006', subject_name: 'Computer Programming 2', year_term: '1st_2nd' },
  { course_code: 'COSC1002', subject_name: 'Discrete Structures 1 (Discrete Mathematics)', year_term: '1st_2nd' },
  { course_code: 'GEDC1010', subject_name: 'Art Appreciation', year_term: '1st_2nd' },
  { course_code: 'NSTP1010', subject_name: 'National Service Training Program 2', year_term: '1st_2nd' },
  { course_code: 'PHED1006', subject_name: 'P.E./PATHFIT 2: Exercise-based Fitness Activities', year_term: '1st_2nd' },
  { course_code: 'GEDC1005', subject_name: 'Mathematics in the Modern World', year_term: '1st_2nd' },
  { course_code: 'GEDC1013', subject_name: 'Science, Technology, and Society', year_term: '1st_2nd' },
  { course_code: 'GEDC1009', subject_name: 'Ethics', year_term: '1st_2nd' },
  { course_code: 'INTE1006', subject_name: 'Systems Administration and Maintenance', year_term: '1st_2nd' },
  
  // SECOND YEAR - FIRST TERM
  { course_code: 'COSC1003', subject_name: 'Data Structures and Algorithms', year_term: '2nd_1st' },
  { course_code: 'GEDC1006', subject_name: 'Readings in Philippine History', year_term: '2nd_1st' },
  { course_code: 'PHED1007', subject_name: 'P.E./PATHFIT 3: Individual-Dual Sports', year_term: '2nd_1st' },
  { course_code: 'GEDC1014', subject_name: "Rizal's Life and Works", year_term: '2nd_1st' },
  { course_code: 'COSC1007', subject_name: 'Human-Computer Interaction', year_term: '2nd_1st' },
  { course_code: 'INTE1008', subject_name: 'Network Administration', year_term: '2nd_1st' },
  { course_code: 'INTE1009', subject_name: 'Platform Technologies', year_term: '2nd_1st' },
  { course_code: 'INTE1010', subject_name: 'Digital Literacy', year_term: '2nd_1st' },
  
  // SECOND YEAR - SECOND TERM
  { course_code: 'CITE1011', subject_name: 'Information Management', year_term: '2nd_2nd' },
  { course_code: 'GEDC1003', subject_name: 'The Entrepreneurial Mind', year_term: '2nd_2nd' },
  { course_code: 'PHED1008', subject_name: 'P.E./PATHFIT 4: Team Sports', year_term: '2nd_2nd' },
  { course_code: 'INTE1011', subject_name: 'IT Application Tools in Business', year_term: '2nd_2nd' },
  { course_code: 'INTE1012', subject_name: 'Computer Organization and Architecture', year_term: '2nd_2nd' },
  { course_code: 'INTE1013', subject_name: 'Web Systems and Technologies', year_term: '2nd_2nd' },
  { course_code: 'INTE1014', subject_name: 'Information Assurance and Security', year_term: '2nd_2nd' },
  
  // THIRD YEAR - FIRST TERM
  { course_code: 'CITE1008', subject_name: 'Application Development and Emerging Technologies', year_term: '3rd_1st' },
  { course_code: 'INSY1011', subject_name: 'Advanced Database Systems', year_term: '3rd_1st' },
  { course_code: 'INTE1016', subject_name: 'Social and Professional Issues in Computing', year_term: '3rd_1st' },
  { course_code: 'INTE1017', subject_name: 'Systems Analysis and Design', year_term: '3rd_1st' },
  { course_code: 'INTE1018', subject_name: 'Multimedia Systems and Technologies', year_term: '3rd_1st' },
  { course_code: 'INTE1019', subject_name: 'IT Elective 1 (Cloud Computing)', year_term: '3rd_1st' },
  { course_code: 'INTE1020', subject_name: 'IT Elective 2 (Cyber Security)', year_term: '3rd_1st' },
  
  // THIRD YEAR - SECOND TERM
  { course_code: 'INTE1083', subject_name: 'Web Systems and Technologies', year_term: '3rd_2nd' },
  { course_code: 'INSY1007', subject_name: 'Management Information Systems', year_term: '3rd_2nd' },
  { course_code: 'INTE1031', subject_name: 'IT Capstone Project 1', year_term: '3rd_2nd' },
  { course_code: 'INTE1032', subject_name: 'Mobile Programming', year_term: '3rd_2nd' },
  { course_code: 'INTE1033', subject_name: 'IT Elective 3 (Internet of Things)', year_term: '3rd_2nd' },
  { course_code: 'INTE1034', subject_name: 'IT Elective 4 (Game Development)', year_term: '3rd_2nd' },
  
  // FOURTH YEAR - FIRST TERM
  { course_code: 'STIC1007', subject_name: 'Euthenics 2', year_term: '4th_1st' },
  { course_code: 'INTE1040', subject_name: 'IT Capstone Project 2', year_term: '4th_1st' },
  { course_code: 'INTE1038', subject_name: 'Technopreneurship', year_term: '4th_1st' },
  { course_code: 'INTE1041', subject_name: 'IT Elective 5 (Big Data Analytics)', year_term: '4th_1st' },
  { course_code: 'INTE1042', subject_name: 'IT Elective 6 (Technological Advancements)', year_term: '4th_1st' },
  
  // FOURTH YEAR - SECOND TERM
  { course_code: 'INTE1043', subject_name: 'IT Practicum (486 hours)', year_term: '4th_2nd' },
]

// ============================================================================
// BSTM - BACHELOR OF SCIENCE IN TOURISM MANAGEMENT
// ============================================================================
const BSTM_COURSES: Course[] = [
  // FIRST YEAR - FIRST TERM
  { course_code: 'STIC1002', subject_name: 'Euthenics 1', year_term: '1st_1st' },
  { course_code: 'GEDC1005', subject_name: 'Mathematics in the Modern World', year_term: '1st_1st' },
  { course_code: 'NSTP1008', subject_name: 'National Service Training Program 1', year_term: '1st_1st' },
  { course_code: 'PHED1005', subject_name: 'P.E./PATHFIT 1: Movement Competency Training', year_term: '1st_1st' },
  { course_code: 'GEDC1006', subject_name: 'Readings in Philippine History', year_term: '1st_1st' },
  { course_code: 'GEDC1008', subject_name: 'Understanding the Self', year_term: '1st_1st' },
  { course_code: 'CTHC1003', subject_name: 'Macro Perspective of Tourism and Hospitality', year_term: '1st_1st' },
  { course_code: 'CTHC1004', subject_name: 'Risk Management as Applied to Safety, Security, and Sanitation', year_term: '1st_1st' },
  
  // FIRST YEAR - SECOND TERM
  { course_code: 'NSTP1010', subject_name: 'National Service Training Program 2', year_term: '1st_2nd' },
  { course_code: 'PHED1006', subject_name: 'P.E./PATHFIT 2: Exercise-based Fitness Activities', year_term: '1st_2nd' },
  { course_code: 'GEDC1016', subject_name: 'Purposive Communication', year_term: '1st_2nd' },
  { course_code: 'STIC1003', subject_name: 'Computer Productivity Tools', year_term: '1st_2nd' },
  { course_code: 'CTHC1006', subject_name: 'Philippine Culture and Tourism Geography', year_term: '1st_2nd' },
  { course_code: 'CTHC1007', subject_name: 'Micro Perspective of Tourism and Hospitality', year_term: '1st_2nd' },
  { course_code: 'TOUR1003', subject_name: 'Global Culture and Tourism Geography', year_term: '1st_2nd' },
  
  // SECOND YEAR - FIRST TERM
  { course_code: 'GEDC1010', subject_name: 'Art Appreciation', year_term: '2nd_1st' },
  { course_code: 'PHED1007', subject_name: 'P.E./PATHFIT 3: Individual-Dual Sports', year_term: '2nd_1st' },
  { course_code: 'GEDC1002', subject_name: 'The Contemporary World', year_term: '2nd_1st' },
  { course_code: 'TOUR1004', subject_name: 'Tour and Travel Management', year_term: '2nd_1st' },
  { course_code: 'TOUR1005', subject_name: 'Hospitality Management', year_term: '2nd_1st' },
  { course_code: 'TOUR1006', subject_name: 'Quality Service Management in Tourism and Hospitality', year_term: '2nd_1st' },
  { course_code: 'TOUR1007', subject_name: 'Ecotourism', year_term: '2nd_1st' },
  
  // SECOND YEAR - SECOND TERM
  { course_code: 'GEDC1009', subject_name: 'Ethics', year_term: '2nd_2nd' },
  { course_code: 'PHED1008', subject_name: 'P.E./PATHFIT 4: (Team Sports)', year_term: '2nd_2nd' },
  { course_code: 'GEDC1013', subject_name: 'Science, Technology, and Society', year_term: '2nd_2nd' },
  { course_code: 'TOUR1008', subject_name: 'Tourism and Hospitality Marketing', year_term: '2nd_2nd' },
  { course_code: 'TOUR1009', subject_name: 'Philippine History, Culture, and Geography', year_term: '2nd_2nd' },
  { course_code: 'TOUR1010', subject_name: 'Air and Sea Travel Management', year_term: '2nd_2nd' },
  { course_code: 'TOUR1011', subject_name: 'Events Management', year_term: '2nd_2nd' },
  
  // THIRD YEAR - FIRST TERM
  { course_code: 'CBMC1001', subject_name: 'Operations Management (TQM)', year_term: '3rd_1st' },
  { course_code: 'GEDC1003', subject_name: 'The Entrepreneurial Mind', year_term: '3rd_1st' },
  { course_code: 'GEDC1045', subject_name: 'Great Books', year_term: '3rd_1st' },
  { course_code: 'CTHC1011', subject_name: 'Foreign Language (Mandarin/Nihongo)', year_term: '3rd_1st' },
  { course_code: 'TOUR1012', subject_name: 'Research in Tourism', year_term: '3rd_1st' },
  { course_code: 'TOUR1013', subject_name: 'Sustainable Tourism', year_term: '3rd_1st' },
  
  // THIRD YEAR - SECOND TERM
  { course_code: 'CBMC1003', subject_name: 'Strategic Management', year_term: '3rd_2nd' },
  { course_code: 'GEDC1041', subject_name: 'Philippine Popular Culture', year_term: '3rd_2nd' },
  { course_code: 'CTHC1016', subject_name: 'Legal Aspects in Tourism and Hospitality', year_term: '3rd_2nd' },
  { course_code: 'TOUR1014', subject_name: 'Global Trends and Issues in Tourism and Hospitality', year_term: '3rd_2nd' },
  { course_code: 'TOUR1015', subject_name: 'Tourism Planning and Development', year_term: '3rd_2nd' },
  { course_code: 'TOUR1016', subject_name: 'Transportation Management', year_term: '3rd_2nd' },
  
  // FOURTH YEAR - FIRST TERM
  { course_code: 'STIC1007', subject_name: 'Euthenics 2', year_term: '4th_1st' },
  { course_code: 'TOUR1017', subject_name: 'BSTM Internship (600 hours)', year_term: '4th_1st' },
]

// ============================================================================
// MAIN DICTIONARY EXPORT
// ============================================================================
export const TERTIARY_COURSE_DICTIONARY: Record<Program, Course[]> = {
  BSA: BSA_COURSES,
  BSBA: BSBA_COURSES,
  BSCpE: BSCpE_COURSES,
  BSCS: BSCS_COURSES,
  BSHM: BSHM_COURSES,
  BSIT: BSIT_COURSES,
  BSTM: BSTM_COURSES,
}

// Helper function to get all courses for a program
export const getCoursesByProgram = (program: Program): Course[] => {
  return TERTIARY_COURSE_DICTIONARY[program] || []
}

// Helper function to get courses by program and year/term
export const getCoursesByProgramAndTerm = (program: Program, yearTerm: YearTerm): Course[] => {
  const courses = getCoursesByProgram(program)
  return courses.filter(course => course.year_term === yearTerm)
}

// Helper function to search courses by keyword (searches both course code and subject name)
export const searchCourses = (program: Program, keyword: string): Course[] => {
  const courses = getCoursesByProgram(program)
  if (!keyword || !keyword.trim()) return courses
  const normalizedKeyword = keyword.toUpperCase().trim()
  return courses.filter(course =>
    course.course_code.toUpperCase().includes(normalizedKeyword) ||
    course.subject_name.toUpperCase().includes(normalizedKeyword)
  )
}

// Helper function to get all unique subject names (for autocomplete)
export const getAllTertiarySubjects = (): string[] => {
  const allCourses = Object.values(TERTIARY_COURSE_DICTIONARY).flat()
  const uniqueSubjects = new Set(allCourses.map(course => course.subject_name))
  return Array.from(uniqueSubjects).sort()
}

// Helper function to get course code by subject name
export const getCourseCodeBySubject = (program: Program, subjectName: string): string | null => {
  const courses = getCoursesByProgram(program)
  const course = courses.find(c => 
    c.subject_name.toLowerCase().trim() === subjectName.toLowerCase().trim()
  )
  return course ? course.course_code : null
}

// Helper function to get all programs
export const getAllPrograms = (): Program[] => {
  return Object.keys(TERTIARY_COURSE_DICTIONARY) as Program[]
}


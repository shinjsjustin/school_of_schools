# linear-algebra-for-ml

## Module 1: Vectors

### Section 1.1: What Vectors Are
- What a vector is and how ML uses them (feature vectors, embeddings)
- Geometric vs algebraic interpretation
- Notation and dimensions

### Section 1.2: Vector Operations
- Addition, subtraction, scalar multiplication
- Dot product and what it measures
- Vector magnitude and unit vectors

### Section 1.3: Distance and Similarity
- Euclidean distance
- Cosine similarity and why ML prefers it
- When to use each

## Module 2: Matrices

### Section 2.1: What Matrices Are
- Matrix as a collection of vectors / a data table
- Shapes, rows vs columns, and how ML data is structured
- Transpose

### Section 2.2: Matrix Operations
- Matrix-vector multiplication (what it actually does geometrically)
- Matrix-matrix multiplication
- Identity matrix and inverse

### Section 2.3: Linear Transformations
- Matrices as transformations (scaling, rotation, projection)
- Why this matters for understanding neural network layers
- Rank and what it tells you about a matrix

## Module 3: Solving Systems

### Section 3.1: Systems of Linear Equations
- What a system of equations is and its matrix form Ax = b
- When solutions exist (none, one, infinite)
- Connection to overdetermined systems in ML (more data than unknowns)

### Section 3.2: Least Squares
- Why exact solutions rarely exist in ML
- Least squares as minimizing error
- The normal equations

## Module 4: Eigenvalues and Decompositions

### Section 4.1: Eigenvalues and Eigenvectors
- What eigenvectors are and the geometric intuition
- What eigenvalues tell you about a transformation
- Why they matter in ML

### Section 4.2: PCA Intuition
- Variance and covariance matrices
- How PCA uses eigenvectors to find principal components
- Dimensionality reduction in practice

### Section 4.3: SVD
- What Singular Value Decomposition is (U, Σ, Vᵀ)
- How it generalizes eigendecomposition to non-square matrices
- Applications: dimensionality reduction, recommendations, compression

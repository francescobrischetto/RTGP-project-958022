/*
Project of Francesco Brischetto: This project is based based on "Geometry-based shading for shape depiction enhancement".
                                 It applies an NPR effect to the illumination model that enhances object shape 
                                 based on object local geometry

illumination_models_modified_fr.frag: Fragment shader for the Lambert, Blinn-Phong, Gooch and Cartoon illumination models
It receives smoothed surface normal, computed in model loading phase, that will be used to calculate the sharpened surface

N.B. 1)  "illumination_models_modified_vt.vert" must be used as vertex shader

N.B. 2)  the different illumination models are implemented using Shaders Subroutines

author: Davide Gadia
refined by: Francesco Brischetto  mat. 958022

Real-Time Graphics Programming - a.a. 2020/2021
Master degree in Computer Science
Universita' degli Studi di Milano

*/

#version 410 core

const float lambda = 1.1;

// output shader variable
out vec4 colorFrag;

// light incidence direction (calculated in vertex shader, interpolated by rasterization)
in vec3 lightDir;
// the transformed normal has been calculated per-vertex in the vertex shader
in vec3 vNormal;
// the transformed smoothed normal has been calculated per-vertex in the vertex shader
in vec3 vSMNormal;
// vector from fragment to camera (in view coordinate)
in vec3 vViewPosition;

// uniforms for Blinn-Phong model
// ambient, diffusive and specular components (passed from the application)
uniform vec3 ambientColor;
uniform vec3 diffuseColor;
uniform vec3 specularColor;
// weight of the components
// in this case, we can pass separate values from the main application even if Ka+Kd+Ks>1. In more "realistic" situations, I have to set this sum = 1, or at least Kd+Ks = 1, by passing Kd as uniform, and then setting Ks = 1.0-Kd
uniform float Ka;
uniform float Kd;
uniform float Ks;
// shininess coefficients (passed from the application)
uniform float shininess;

// uniforms used as control parameters for all the functions defined in the reference paper
uniform float alpha;
const float r = 1.2f;
const float Ql = 4;

// uniforms for Toon Shading Model
const vec3 shinestColor = vec3(1.0,0.8,0.4);
const vec3 shinyColor   = vec3(0.6,0.5,0.2);
const vec3 darkColor    = vec3(0.4,0.4,0.1);
const vec3 gloomyColor  = vec3(0.2,0.1,0.1);

//TODO: Fix This
// uniforms for GGX model
 // rugosity - 0 : smooth, 1: rough
uniform float F0; // fresnel reflectance at normal incidence

////////////////////////////////////////////////////////////////////

// the "type" of the Subroutine
subroutine vec3 ill_model();
// Subroutine Uniform (it is conceptually similar to a C pointer function)
subroutine uniform ill_model Illumination_Model;

////////////////////////////////////////////////////////////////////

///////////////////HELPING FUNCTIONS///////////////////////
// My proposed method for calculating curvature (used by Enhanced Blinn-Phong model)
// Based on: https://madebyevan.com/shaders/curvature/
float curvature(vec3 N_I)
{
  // We compute curvature exploiting partial derivatives of the Enhanced Surface Normal
  vec3 dx = dFdx(N_I);
  vec3 dy = dFdy(N_I);
  float curvature_value = (cross(N_I - dx, N_I + dx).y - cross(N_I - dy, N_I + dy).x);
  return clamp(curvature_value, -1, 1);
}

//////////////////////////////////////////
// Curvature-Based Reflectance Scaling Function (used by Enhanced Blinn-Phong model)
// Defined in the reference paper in chapter 5.1
float Lr(float curvature_value, float delta)
{
  // We apply the curvature mapping function that uses lambda and alpha parameters to apply non-linear mapping
  float P = pow (lambda * abs(curvature_value), alpha);
  // Uses as intensity mapping function the second parameter, delta
  // This function maps intensity mapping and curvature mapping functions in the reflectance radiance equation
  // This aims to correlate the reflected lightning intensity to surface curvature
  float G = delta / ( exp(P) * ( 1 - delta ) + delta );
  return G;
}
//////////////////////////////////////////

///////////////////ILLUMINATION MODELS///////////////////////
// a subroutine for the Lambert model
subroutine(ill_model)
vec3 Lambert() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
    // normalization of the per-fragment normal
    vec3 N = normalize(vNormal);
    // normalization of the per-fragment light incidence direction
    vec3 L = normalize(lightDir.xyz);
    // Lambert coefficient
    float lambertian = max(dot(L,N), 0.0);
    // Lambert illumination model  
    return vec3(Kd * lambertian * diffuseColor);
}
//////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Blinn-Phong model
subroutine(ill_model)
vec3 BlinnPhong() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
    // ambient component can be calculated at the beginning
    vec3 color = Ka*ambientColor;
    // normalization of the per-fragment normal
    vec3 N = normalize(vNormal);
    // normalization of the per-fragment light incidence direction
    vec3 L = normalize(lightDir.xyz);
    // Lambert coefficient
    float lambertian = max(dot(L,N), 0.0);
    // if the lambert coefficient is positive, then I can calculate the specular component
    if(lambertian > 0.0)
    {
      // the view vector has been calculated in the vertex shader, already negated to have direction from the mesh to the camera
      vec3 V = normalize( vViewPosition );
      // in the Blinn-Phong model we do not use the reflection vector, but the half vector
      vec3 H = normalize(L + V);
      // we use H to calculate the specular component
      float specAngle = max(dot(H, N), 0.0);
      // shininess application to the specular component
      float specular = pow(specAngle, shininess);
      // We add diffusive and specular components to the final color
      // N.B. ): in this implementation, the sum of the components can be different than 1
      color += vec3( Kd * lambertian * diffuseColor +
                     Ks * specular * specularColor);
    }
    return color;
}
//////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Enhanced Blinn-Phong model using Shape Depiction Enhancement based on local Geometry 
subroutine(ill_model)
vec3 EnhancedBlinnPhong()
{
  // Computing the mask for Unsharp Masking
  vec3 mask = vNormal - vSMNormal;
  // calculating enhanced Normal using the Unsharp Masking technique
  // This is defined, in the reference paper, in equation 6 of chapter 4.2.2
  vec3 eNormal = vNormal + lambda * mask;
  // normalization of the per-fragment normal
  vec3 N_I = normalize(eNormal);
  // calculating curvature value using enhanced normal
  float curvature_value = curvature(N_I);
  // Implementing equation 12 of chapter 6.1 of the reference paper
  // I calculate the Curvature-Based Reflectance Scaling factor for each of the Blinn-Phong components
  // NOTE: Reference paper use the costant 1 as rho_a component for ambient
  float G_a = Lr(curvature_value, 1);  
  // ambient component can be calculated at this point
  vec3 color = Ka * G_a * ambientColor;
  // normalization of the per-fragment light incidence direction
  vec3 L = normalize(lightDir.xyz);
  // Lambert coefficient
  float lambertian = max(dot(L,N_I), 0.0);
  // if the lambert coefficient is positive, then I can calculate the specular component
  if(lambertian > 0.0)
  {
    // This is the Curvature-Based Reflectance Scaling factor for the diffuse component
    // NOTE: Reference paper use the lambertian coefficient as rho_d for diffuse
    float G_d = Lr(curvature_value, lambertian); 
    // the view vector has been calculated in the vertex shader, already negated to have direction from the mesh to the camera
    vec3 V = normalize( vViewPosition );
    // in the Blinn-Phong model we do not use the reflection vector, but the half vector
    vec3 H = normalize(L + V);
    // we use H to calculate the specular component
    float specAngle = max(dot(H, N_I), 0.0);
    // shininess application to the specular component
    float specular = pow(specAngle, shininess);
    // This is the Curvature-Based Reflectance Scaling factor for the specular component
    // NOTE: Reference paper use the lambertian coefficient as rho_s for specular
    float G_s = Lr(curvature_value, specular);
    // We add diffusive and specular components to the final color using our Curvature-Based factors
    color += vec3( Kd * G_d * diffuseColor +
                   Ks * G_s * specularColor);
  }
  return color;
}
//////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Cartoon/Cel Shading model
subroutine(ill_model)
vec3 ToonShading(){
  // normalization of the per-fragment light incidence direction
  vec3 L = normalize(lightDir.xyz);
  // normalization of the per-fragment normal
  vec3 N = normalize(vNormal);
  // Intensity parameter used in standard toon/cel shading
	float intensity = dot(L,N);
  // Color choice based on intensity parameter
	if (intensity > 0.95)       return shinestColor;
	else if (intensity > 0.5)   return shinyColor;
	else if (intensity > 0.25)  return darkColor;
	else                        return gloomyColor;
}
//////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Enhanced Cartoon/Cel Shading model using Shape Depiction Enhancement based on local Geometry 
subroutine(ill_model)
vec3 EnhancedToonShading(){
  // normalization of the per-fragment light incidence direction
  vec3 L = normalize(lightDir.xyz);
  // Computing the mask for Unsharp Masking
  vec3 mask = vNormal - vSMNormal;
  // calculating enhanced Normal using the Unsharp Masking technique
  // This is defined, in the reference paper, in equation 6 of chapter 4.2.2
  vec3 eNormal = vNormal + lambda * mask;
  // normalization of the per-fragment normal
  vec3 N_I = normalize(eNormal);
  // Intensity parameter used in standard toon/cel shading, but using our enhanced normal
	float intensity = dot(L,N_I);
  // Equation 13 of the Chapter 6.2 of the reference paper
  // TODO: Need refinement, we need to do it also for specular and ambient
  intensity = floor(0.5 + (Ql * pow(intensity,r))) / Ql;
  // Color choice based on intensity parameter
	if (intensity > 0.95)       return shinestColor;
	else if (intensity > 0.5)   return shinyColor;
	else if (intensity > 0.25)  return darkColor;
	else                        return gloomyColor;
}

//TODO: Add comments BUT IT WORKS
subroutine(ill_model)
vec3 EnhancedGoochShading(){
  vec3  SurfaceColor = vec3(0.65, 0.65, 0.65);
  vec3  WarmColor = vec3(0.3, 0.3, 0);
  vec3  CoolColor = vec3(0, 0, 0.55);
  vec3  SurfaceColorA = vec3(0.65, 0.65, 0.65);
  vec3  WarmColorA = vec3(0.3, 0.3, 0);
  vec3  CoolColorA = vec3(0, 0, 0.55);
  vec3  SurfaceColorS = vec3(1, 1, 1);
  vec3  WarmColorS = vec3(0.8, 0.8, 0);
  vec3  CoolColorS = vec3(0.2, 0.2, 0);
  float DiffuseWarm = 0.5;
  float DiffuseCool = 0.25;
  vec3 L = normalize(lightDir.xyz);
  
  vec3 mask = vNormal - vSMNormal;
  vec3 unsharp_Normal = vNormal + lambda*mask;
  vec3 N = normalize(unsharp_Normal);

  float roA = 1;
  roA = (1 + roA) * 0.5;
  float roD = dot(N,L);
  roD = (1 + roD) * 0.5;
  vec3 V = normalize( vViewPosition );
  vec3 refLN = normalize(reflect(-L, N));
  float ER    = clamp(dot(refLN, V), 0, 1);
  float roS = pow(ER, shininess);
  //roS = (1 + roS) * 0.5;



  /*vec3 refLN = normalize(reflect(-L, N));
  float NdotL = (dot(L, N) + 1.0) * 0.5;
  
 
  vec3 kfinal   = mix(kcool, kwarm, NdotL);
  float ER    = clamp(dot(refLN, V), 0, 1);
  vec3 spec   = vec3(1) * pow(ER, 64.0);*/

  vec3 kcoolD    = min(CoolColor + DiffuseCool * SurfaceColor, 1.0);
  vec3 kwarmD    = min(WarmColor + DiffuseWarm * SurfaceColor, 1.0);
  vec3 kcoolA    = min(CoolColor + DiffuseCool * SurfaceColor, 1.0);
  vec3 kwarmA    = min(WarmColor + DiffuseWarm * SurfaceColor, 1.0); 
  vec3 kcoolS    = min(CoolColor + DiffuseCool * SurfaceColor, 1.0);
  vec3 kwarmS    = min(WarmColor + DiffuseWarm * SurfaceColor, 1.0);  
  vec3 kfinalA = mix(kcoolA,kwarmA, roA);
  vec3 kfinalD = mix(kcoolD,kwarmD, roD);
  //vec3 kfinalS = mix(kcoolS,kwarmS, roS);
  vec3 kfinalS = vec3(1) * roS;
  return  0.2*kfinalA + 0.8*kfinalD + kfinalS;
}

//TODO: Add comments BUT IT WORKS
subroutine(ill_model)
vec3 GoochShading(){
  vec3  SurfaceColor = vec3(0.65, 0.65, 0.65);
  vec3  WarmColor = vec3(0.3, 0.3, 0);
  vec3  CoolColor = vec3(0, 0, 0.55);
  float DiffuseWarm = 0.5;
  float DiffuseCool = 0.25;
  vec3 L = normalize(lightDir.xyz);
  vec3 N = normalize(vNormal);
  vec3 refLN = normalize(reflect(-L, N));
  float NdotL = (dot(L, N) + 1.0) * 0.5;
  vec3 V = normalize( vViewPosition );
  vec3 kcool    = min(CoolColor + DiffuseCool * SurfaceColor, 1.0);
  vec3 kwarm    = min(WarmColor + DiffuseWarm * SurfaceColor, 1.0); 
  vec3 kfinal   = mix(kcool, kwarm, NdotL);
  float ER    = clamp(dot(refLN, V), 0, 1);
  vec3 spec   = vec3(1) * pow(ER, shininess);
  return vec3(kfinal + spec);
}

// main
void main(void)
{
    // we call the pointer function Illumination_Model():
    // the subroutine selected in the main application will be called and executed
  	vec3 color = Illumination_Model(); 
    colorFrag = vec4(color, 1.0);
}
